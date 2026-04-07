# DeepSynaps Studio — Data Dictionary v2.0

**Version:** 2.0 | **Date:** 2026-04-07 | **Tables:** 12 | **Total Records:** 332

---

## Table Overview

| # | Table | Records | Primary Key | Description |
|---|---|---|---|---|
| 1 | Evidence_Levels | 4 | Evidence_ID | EV-A through EV-D evidence grading hierarchy |
| 2 | Governance_Rules | 12 | Rule_ID | GOV-001 through GOV-012 platform safety rules |
| 3 | Modalities | 16 | Modality_ID | 16 neuromodulation modalities with regulatory status |
| 4 | Devices | 29 | Device_ID | 29 commercial devices with regulatory detail |
| 5 | Conditions | 31 | Condition_ID | 31 clinical conditions with ICD-10 codes |
| 6 | Symptoms_Phenotypes | 6 | Phenotype_ID | qEEG-defined phenotypes for protocol targeting |
| 7 | Assessments | 22 | Assessment_ID | 22 condition-assessment mappings with scales, neuropsych, qEEG |
| 8 | Protocols | 100 | Protocol_ID | 100 evidence-graded treatment protocols across 11 modalities |
| 9 | Sources | 37 | Source_ID | 37 high-quality literature sources with DOIs |
| 10 | Brain_Regions | 46 | Region_ID | 46 anatomical regions with EEG mapping and brain networks |
| 11 | qEEG_Condition_Map | 22 | Map_ID | 22 conditions with qEEG biomarker signatures |
| 12 | qEEG_Biomarkers | 7 | Band_ID | 7 frequency bands with clinical significance |

---

## Key Relationships

- Protocols → Conditions (Condition_ID FK)
- Protocols → Modalities (Modality_ID FK)
- Protocols → Evidence_Levels (Evidence_Level FK)
- Devices → Modalities (Modality_ID FK)
- Assessments → Conditions (Condition_ID FK)
- qEEG_Condition_Map → Conditions (Condition_ID FK)
- Symptoms_Phenotypes → Conditions (Condition_ID FK)
- Symptoms_Phenotypes → Evidence_Levels (Evidence_Level FK)

## Field Details

### Protocols Table (100 records) — Key Fields

| Field | Type | Description |
|---|---|---|
| Protocol_ID | PK | PROT-001 through PROT-100 |
| Condition_ID | FK→Conditions | Linked condition |
| Modality_ID | FK→Modalities | Treatment modality |
| Target_Region | text | Brain target(s) |
| EEG_Position | string | 10-20 electrode position(s) |
| Evidence_Summary | text | Full protocol description |
| Intensity | string | Stimulation intensity/energy |
| Frequency_Hz | string | Stimulation frequency |
| Session_Duration | string | Per-session duration |
| Total_Course | string | Total treatment course |
| Pulses_Dose | string | Pulses/dose per session |
| Electrode_Coil_Montage | text | Setup details |
| Device_Reference | text | Applicable device(s) |
| Regulatory_Status | text | Normalized regulatory status |
| Evidence_Level | FK→Evidence | EV-A through EV-D |
| Governance_Flags | string | Active governance flags |
| Review_Status | enum | Pending / Reviewed / To Verify |

### Brain_Regions Table (46 records) — NEW

| Field | Type | Description |
|---|---|---|
| Region_ID | PK | BR-001 through BR-046 |
| Region_Name | string | Anatomical name |
| Abbreviation | string | Short form (e.g. DLPFC) |
| Lobe | string | Brain lobe |
| Depth | enum | Cortical / Subcortical |
| EEG_Position_10_20 | string | 10-20 system position(s) |
| Brodmann_Area | string | Brodmann area(s) |
| Primary_Functions | text | Key functions |
| Brain_Network | string | Network assignment(s) |
| Key_Conditions | text | Conditions where this is a target |
| Targetable_Modalities | text | Which modalities can reach it |

### qEEG_Condition_Map (22 records) — NEW

| Field | Type | Description |
|---|---|---|
| Map_ID | PK | QCM-001 through QCM-022 |
| Condition_ID | FK→Conditions | Linked condition |
| qEEG_Patterns | text | Characteristic EEG patterns |
| Key_qEEG_Electrode_Sites | string | Key electrode sites |
| Primary_Networks_Disrupted | text | Disrupted networks |
| Recommended_Neuromod_Techniques | text | Recommended interventions |
| Stimulation_Rationale | text | Clinical rationale |

### qEEG_Biomarkers (7 records) — NEW

| Field | Type | Description |
|---|---|---|
| Band_ID | PK | QBM-001 through QBM-007 |
| Band_Name | string | Frequency band (Alpha, Theta, etc.) |
| Hz_Range | string | Frequency range |
| Pathological_Increase | text | Clinical meaning of ↑ |
| Pathological_Decrease | text | Clinical meaning of ↓ |
| Associated_Disorders | text | Linked conditions |

---

*Data Dictionary v2.0 — 2026-04-07*
