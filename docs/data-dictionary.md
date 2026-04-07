# DeepSynaps Studio — Master Clinical Database: Data Dictionary

**Version:** 1.0  
**Generated:** 2026-04-07  
**Total Records:** 201 across 9 tables  

---

## Overview

This data dictionary describes every table and field in the DeepSynaps Studio Master Clinical Database. The database supports evidence-graded clinical decision-making for neuromodulation therapies. All data follows strict governance rules and evidence traceability requirements.

### Key Principles

- **FDA "cleared" (510(k)) ≠ "approved" (PMA)** — Regulatory terminology is precise throughout.
- **Device listing/registration ≠ approved intended use** — Registration alone does not imply regulatory approval for a specific indication.
- **Neurofeedback is not universally proven** — ADHD evidence graded EV-D per Cortese 2024 meta-analysis (blinded standards).
- **Every row is traceable** — Source URLs and review status are required for all clinical data.
- **Correctness over coverage** — Unverified claims are marked "to verify" rather than guessed.

---

## Table 1: Evidence_Levels (4 records)

Defines the 4-tier evidence grading hierarchy used across the database.

| Field | Type | Description |
|-------|------|-------------|
| `Evidence_Level_ID` | Text (PK) | Unique identifier (EV-A through EV-D) |
| `Evidence_Label` | Text | Human-readable label (e.g., "Guideline-supported") |
| `Rank_Order` | Integer | Sort order (1 = highest evidence) |
| `Definition` | Text | Full definition of this evidence tier |
| `Minimum_Source_Standard` | Text | Minimum source type required for this grade |
| `Patient_Facing_Allowed` | Boolean | Whether data at this level can be shown to patients |
| `Clinician_Only` | Boolean | Whether data is restricted to clinician view |
| `Community_Display_Label` | Text | Label used in community-facing contexts |
| `Notes` | Text | Additional guidance or caveats |

### Evidence Hierarchy

| ID | Label | Meaning |
|----|-------|---------|
| EV-A | Guideline-supported | Endorsed by international guidelines (APA, CANMAT, NICE, etc.) |
| EV-B | Literature-supported | Supported by peer-reviewed meta-analyses or RCTs |
| EV-C | Emerging | Early-stage evidence from pilot studies or open-label trials |
| EV-D | Experimental | Case reports, preclinical data, or theoretical rationale only |

---

## Table 2: Governance_Rules (12 records)

Rules controlling data display, export, and clinical safety.

| Field | Type | Description |
|-------|------|-------------|
| `Rule_ID` | Text (PK) | Unique rule identifier (GOV-001 through GOV-012) |
| `Rule_Name` | Text | Short rule name |
| `Applies_To` | Text | Which table(s) or data types the rule governs |
| `Rule_Logic` | Text | Detailed logic or condition for the rule |
| `User_Role_Required` | Text | Minimum user role to access (clinician, admin, etc.) |
| `Export_Allowed` | Boolean | Whether data governed by this rule can be exported |
| `Warning_Text` | Text | Warning shown when rule is triggered |
| `Notes` | Text | Implementation guidance |

---

## Table 3: Modalities (12 records)

Reference table of neuromodulation modality types.

| Field | Type | Description |
|-------|------|-------------|
| `Modality_ID` | Text (PK) | Unique identifier (e.g., MOD-TMS, MOD-TDCS) |
| `Modality_Name` | Text | Full name (e.g., "Repetitive TMS (rTMS)") |
| `Category` | Text | Category: Brain Stimulation, Neuromodulation, Biofeedback, etc. |
| `Invasive_vs_Noninvasive` | Text | Invasive, Noninvasive, or Minimally invasive |
| `Typical_Target` | Text | Common brain targets or mechanism |
| `Delivery_Method` | Text | How therapy is delivered (coil, electrodes, etc.) |
| `Common_Use_Cases` | Text | Primary clinical applications |
| `Evidence_Notes` | Text | Summary of evidence base |
| `Regulatory_Notes` | Text | FDA/CE regulatory status summary |
| `Safety_Questions` | Text | Key safety considerations |
| `Review_Status` | Text | Data review status (reviewed, to verify, etc.) |

---

## Table 4: Devices (19 records)

FDA-cleared/approved neuromodulation devices with full regulatory traceability.

| Field | Type | Description |
|-------|------|-------------|
| `Device_ID` | Text (PK) | Unique identifier (e.g., DEV-001) |
| `Device_Name` | Text | Commercial device name |
| `Manufacturer` | Text | Device manufacturer |
| `Modality` | Text | Modality ID reference |
| `Device_Type` | Text | Category (TMS system, tDCS device, etc.) |
| `Region` | Text | Regulatory region (US, EU, etc.) |
| `Regulatory_Status` | Text | Precise regulatory status (e.g., "FDA cleared (510(k))") |
| `Regulatory_Pathway` | Text | Pathway type (510(k), PMA, De Novo, CE marking) |
| `Official_Indication` | Text | Official regulatory-approved indication text |
| `Intended_Use_Text` | Text | Manufacturer's intended use statement |
| `Approved_Use_Only_Flag` | Boolean | Whether device should only be used for approved indication |
| `Home_vs_Clinic` | Text | Setting: clinic-only, home-use, or both |
| `Channels` | Text | Number of channels/coils |
| `Electrode_or_Coil_Type` | Text | Type of electrode or coil |
| `Targeting_Type` | Text | Targeting method (neuronavigation, manual, etc.) |
| `Key_Tech_Specs` | Text | Key technical specifications |
| `Contraindications` | Text | Known contraindications |
| `Adverse_Event_Notes` | Text | Common adverse events |
| `Population` | Text | Target population (adult, pediatric, etc.) |
| `Source_URL_Primary` | URL | Primary source (FDA database, manufacturer, etc.) |
| `Source_URL_Secondary` | URL | Secondary verification source |
| `Review_Status` | Text | Data review status |
| `Last_Reviewed` | Date | Date of last data review |
| `Notes` | Text | Additional notes or caveats |

### Regulatory Status Values

| Value | Meaning |
|-------|---------|
| FDA cleared (510(k)) | Cleared via 510(k) — substantial equivalence to predicate |
| FDA approved (PMA) | Approved via Pre-Market Approval — highest regulatory standard |
| FDA cleared (De Novo) | Cleared via De Novo pathway — novel, low-moderate risk |
| CE-marked (EU MDR) | European conformity marking under Medical Device Regulation |
| CE-marked (MDD) | European conformity under older Medical Device Directive |

---

## Table 5: Conditions (20 records)

Clinical conditions targeted by neuromodulation therapies.

| Field | Type | Description |
|-------|------|-------------|
| `Condition_ID` | Text (PK) | Unique identifier (e.g., CON-001) |
| `Condition_Name` | Text | Clinical condition name |
| `Category` | Text | Category: Mood, Anxiety, Pain, Movement, Cognitive, etc. |
| `Symptom_Clusters` | Text | Key symptom clusters (semicolon-separated) |
| `Common_Phenotypes` | Text | Phenotype IDs commonly associated |
| `Severity_Levels` | Text | Applicable severity gradations |
| `Population` | Text | Target population |
| `Core_Assessments` | Text | Primary assessment tool IDs |
| `Contraindication_Alerts` | Text | Key contraindications for neuromodulation |
| `Relevant_Modalities` | Text | Modality IDs with evidence for this condition |
| `Highest_Evidence_Level` | Text | Highest evidence grade achieved (with modality context) |
| `Notes` | Text | Clinical notes and caveats |
| `Review_Status` | Text | Data review status |

---

## Table 6: Symptoms_Phenotypes (30 records)

Symptom clusters and phenotype subtypes enabling precision targeting.

| Field | Type | Description |
|-------|------|-------------|
| `Phenotype_ID` | Text (PK) | Unique identifier (e.g., PHE-001) |
| `Symptom_or_Phenotype_Name` | Text | Descriptive name |
| `Domain` | Text | Domain: Cognitive, Affective, Motor, Autonomic, etc. |
| `Description` | Text | Clinical description |
| `Associated_Conditions` | Text | Condition IDs where this phenotype appears |
| `Possible_Target_Regions` | Text | Brain regions or systems to target |
| `Candidate_Modalities` | Text | Modality IDs that may address this phenotype |
| `Evidence_Level` | Text | Best available evidence grade |
| `Assessment_Inputs_Needed` | Text | Assessment IDs used to identify this phenotype |
| `Review_Status` | Text | Data review status |

---

## Table 7: Assessments (42 records)

Validated clinical assessment tools, rating scales, and measurement instruments.

| Field | Type | Description |
|-------|------|-------------|
| `Assessment_ID` | Text (PK) | Unique identifier (e.g., ASS-001) |
| `Assessment_Name` | Text | Full assessment name with abbreviation |
| `Assessment_Type` | Text | Type: Self-report, Clinician-rated, Performance, Biomarker, etc. |
| `Domain` | Text | Clinical domain measured |
| `Use_Case` | Text | When/why to administer |
| `Population` | Text | Target population |
| `Link_URL` | URL | Link to official tool or documentation |
| `License_or_Access_Notes` | Text | Licensing, cost, access requirements |
| `Scoring_Type` | Text | Scoring method (Likert, ordinal, continuous, etc.) |
| `Clinician_vs_Patient` | Text | Who administers: clinician, patient, or both |
| `Related_Conditions` | Text | Condition IDs this assessment is used for |
| `Related_Phenotypes` | Text | Phenotype IDs this assessment can identify |
| `Notes` | Text | Additional notes |
| `Review_Status` | Text | Data review status |

### Assessment Types

| Type | Description |
|------|-------------|
| Self-report | Patient completes independently |
| Clinician-rated | Clinician scores based on interview/observation |
| Performance-based | Objective task performance measurement |
| Biomarker | Physiological or neuroimaging measurement |
| Composite | Combines multiple measurement approaches |

---

## Table 8: Protocols (32 records)

Evidence-based treatment protocols with stimulation parameters.

| Field | Type | Description |
|-------|------|-------------|
| `Protocol_ID` | Text (PK) | Unique identifier (e.g., PRO-001) |
| `Protocol_Name` | Text | Descriptive protocol name |
| `Condition_ID` | Text (FK) | References Conditions table |
| `Phenotype_ID` | Text (FK) | References Symptoms_Phenotypes table (if specific) |
| `Modality_ID` | Text (FK) | References Modalities table |
| `Device_ID_if_specific` | Text (FK) | References Devices table (if device-specific) |
| `On_Label_vs_Off_Label` | Text | On-label, Off-label, or N/A |
| `Evidence_Grade` | Text | Evidence grade (EV-A through EV-D) |
| `Evidence_Summary` | Text | Summary of supporting evidence |
| `Target_Region` | Text | Brain target (e.g., left DLPFC, M1) |
| `Laterality` | Text | Left, Right, Bilateral, or Midline |
| `Frequency_Hz` | Text | Stimulation frequency |
| `Intensity` | Text | Stimulation intensity (% MT, mA, etc.) |
| `Session_Duration` | Text | Duration per session |
| `Sessions_per_Week` | Text | Frequency of sessions |
| `Total_Course` | Text | Total treatment course |
| `Coil_or_Electrode_Placement` | Text | Specific placement instructions |
| `Monitoring_Requirements` | Text | Required monitoring during treatment |
| `Contraindication_Check_Required` | Boolean | Whether contraindication screening is required |
| `Adverse_Event_Monitoring` | Text | Adverse events to monitor |
| `Escalation_or_Adjustment_Rules` | Text | Rules for dose adjustment |
| `Patient_Facing_Allowed` | Boolean | Whether protocol details can be shown to patients |
| `Clinician_Review_Required` | Boolean | Whether clinician must review before use |
| `Source_URL_Primary` | URL | Primary evidence source |
| `Source_URL_Secondary` | URL | Secondary evidence source |
| `Notes` | Text | Additional protocol notes |
| `Review_Status` | Text | Data review status |

---

## Table 9: Sources (30 records)

Primary source references for all clinical data.

| Field | Type | Description |
|-------|------|-------------|
| `Source_ID` | Text (PK) | Unique identifier (e.g., SRC-001) |
| `Source_Type` | Text | Type: Guideline, Meta-analysis, RCT, Regulatory, Review, etc. |
| `Title` | Text | Source title or description |
| `URL` | URL | Direct URL to source |
| `Authority_Level` | Text | Authority: Tier 1 (guidelines), Tier 2 (meta-analyses), Tier 3 (RCTs), etc. |
| `Publication_Year` | Text | Year published or last updated |
| `Use_Case` | Text | What this source is used to support |
| `Notes` | Text | Additional context |
| `Last_Checked` | Date | Date URL was last verified accessible |

### Source Authority Tiers

| Tier | Type | Example |
|------|------|---------|
| Tier 1 | International guidelines | APA, CANMAT, NICE, EAN guidelines |
| Tier 2 | Systematic reviews / meta-analyses | Cochrane reviews, network meta-analyses |
| Tier 3 | Randomised controlled trials | Pivotal RCTs, large multicenter trials |
| Tier 4 | Regulatory databases | FDA 510(k), PMA databases, MAUDE |
| Tier 5 | Expert reviews / consensus | Expert consensus statements, narrative reviews |

---

## Cross-Reference Keys

| From Table | Field | References |
|------------|-------|------------|
| Protocols | Condition_ID | Conditions.Condition_ID |
| Protocols | Phenotype_ID | Symptoms_Phenotypes.Phenotype_ID |
| Protocols | Modality_ID | Modalities.Modality_ID |
| Protocols | Device_ID_if_specific | Devices.Device_ID |
| Protocols | Evidence_Grade | Evidence_Levels.Evidence_Level_ID |
| Conditions | Core_Assessments | Assessments.Assessment_ID (semicolon-separated) |
| Conditions | Relevant_Modalities | Modalities.Modality_ID (semicolon-separated) |
| Phenotypes | Associated_Conditions | Conditions.Condition_ID (semicolon-separated) |
| Phenotypes | Candidate_Modalities | Modalities.Modality_ID (semicolon-separated) |
| Phenotypes | Assessment_Inputs_Needed | Assessments.Assessment_ID (semicolon-separated) |

---

## Review Status Values

All clinical data rows carry a `Review_Status` field:

| Value | Meaning |
|-------|---------|
| Reviewed | Data verified against primary sources |
| To verify | Data populated but needs cross-checking |
| Draft | Initial entry, requires full review |
| Flagged | Conflicting or questionable data requiring attention |

---

## Notes

- **Public domain assessments** (VAS, NRS, TMT, CGI, FMA-UE, Seizure Diary): No Link_URL provided because these are public domain instruments without a single authoritative URL. Notes field explains this.
- **Clinic-specific templates** (Contraindication Checklist, Seizure Diary): URLs omitted; these are custom per clinic.
- **qEEG Assessment Categories**: Proprietary normative databases vary by vendor; no single URL applies.
- **Semicolon-separated fields**: Multi-value fields (e.g., Relevant_Modalities, Core_Assessments) use semicolons as delimiters.
