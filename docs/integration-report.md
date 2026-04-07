# DeepSynaps Studio — Data Integration Report
## SOZO Brain Center Protocol Library Import

**Date:** 2026-04-07 10:44  
**Database Version:** 2.0  
**Previous Version:** 1.0 (201 records, 9 tables)  
**Source Files Processed:** 7 (3 Excel workbooks + 3 literature CSVs + 1 primary protocol workbook)

---

## Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Tables | 9 | 12 | +3 |
| Total Records | 201 | 332 | +131 |
| Modalities | 12 | 16 | +4 |
| Conditions | 20 | 31 | +11 |
| Protocols | 32 | 100 | +68 |
| Devices | ~15 | 29 | +14 |
| Assessments | 42 | 22 | varies |
| Sources | ~20 | 37 | +17 |
| Brain Regions | 0 | 46 | +46 |
| qEEG Condition Maps | 0 | 22 | +22 |
| qEEG Biomarkers | 0 | 7 | +7 |
| Phenotypes | ~5 | 6 | +1 |

---

## New Tables Added

1. **Brain_Regions** — 46 anatomical regions with 10-20 EEG positions, Brodmann areas, FNON network assignments
2. **qEEG_Condition_Map** — 22 conditions with qEEG biomarker signatures, electrode sites, network dysfunction patterns, stimulation rationale
3. **qEEG_Biomarkers** — 7 frequency bands with normal/pathological signatures and clinical significance

## New Modalities Added

| ID | Modality | Protocols | Regulatory |
|---|---|---|---|
| MOD-013 | tACS | 9 | Investigational (Nexalin 510(k) for insomnia only) |
| MOD-014 | PEMF | 10 | Investigational — no FDA clearance for neuropsychiatric |
| MOD-015 | LIFU/tFUS | 8 | Investigational — MRgFUS ablation ≠ neuromodulation |
| MOD-016 | tRNS | 8 | Investigational — no FDA clearance for neuropsychiatric |

## New Conditions Added (11)

| ID | Condition | Category | Status |
|---|---|---|---|
| COND-021 | Schizophrenia | Psychotic Disorder | Pending |
| COND-022 | Disorders of Consciousness (DOC) | Neurological | Pending |
| COND-023 | Mild Cognitive Impairment (MCI) | Neurodegenerative | Pending |
| COND-024 | Multiple Sclerosis (MS) | Neurological / Autoimmune | Pending |
| COND-025 | Fibromyalgia | Pain / Rheumatic | Pending |
| COND-026 | Cognitive Enhancement | Cognitive / Performance | Pending |
| COND-027 | Inflammatory / Rheumatoid Arthritis | Inflammatory / Pain | Pending |
| COND-028 | Motor / Perceptual Learning | Cognitive / Performance | Pending |
| COND-029 | Tourette's Syndrome | Movement / Neurodevelopmental | Pending |
| COND-030 | Vascular Cognitive Impairment (VCI) | Cerebrovascular / Cognitive | Pending |
| COND-031 | MS-related Pain | Pain / Neurological | Pending |

## Protocol Import Summary

- **Total protocols imported:** 100
- **All protocols set to Review_Status = "Pending"** (none auto-published per GOV-011)
- **Evidence level distribution:**

| Grade | Count | Description |
|---|---|---|
| EV-A | 7 | Guideline-endorsed |
| EV-B | 40 | Strong research evidence |
| EV-C | 16 | Emerging evidence |
| EV-D | 37 | Preliminary / investigational |

## Governance Flags Raised

| Flag | Count | Description |
|---|---|---|
| GOV-001 | 80 | Off-label / investigational protocol |
| GOV-002 | 37 | EV-D evidence — cannot be patient-facing |
| GOV-003 | 35 | Investigational modality (tACS/PEMF/LIFU/tRNS) |

## Review Queue

- **Protocols pending review:** 100
- **Conditions pending review:** 11

## Regulatory Integrity Checks — All Passed

- [x] "FDA cleared" vs "FDA approved" used with correct distinction
- [x] Flow FL-100 remains ONLY PMA-approved tDCS device (GOV-009)
- [x] "FDA Breakthrough Designation" noted as designation, NOT clearance
- [x] All tACS/PEMF/LIFU/tRNS flagged with GOV-003
- [x] Neurofeedback ADHD remains EV-D (GOV-008)
- [x] No marketing language in regulatory fields (GOV-010)
- [x] All new records enter review queue (GOV-011)

## QA Results: 53 tests passed, 0 failed, 0 warnings

---

*Generated 2026-04-07 10:44 by DeepSynaps Studio Integration Engine*
