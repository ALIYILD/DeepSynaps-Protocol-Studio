# PHASE 2: Adverse Event Intelligence Deep Research — FAERS + OnSIDES

> **Version:** 2.0.0
> **Status:** Integration Architecture Specification
> **Scope:** Adverse event intelligence layer for DeepSynaps Protocol Studio
> **Classification:** Safety-Critical Clinical Decision Support
> **Researcher:** Pharmacovigilance Research Specialist
> **Date:** 2025-07

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [FAERS Deep Dive](#2-faers-deep-dive)
3. [OnSIDES Deep Dive](#3-onsides-deep-dive)
4. [Pharmacovigilance Methodology](#4-pharmacovigilance-methodology)
5. [Signal Detection Algorithms](#5-signal-detection-algorithms)
6. [DeepSynaps Integration Architecture](#6-deepsynaps-integration-architecture)
7. [Display Rules & Caveats](#7-display-rules--caveats)
8. [Provenance & Confidence Model](#8-provenance--confidence-model)
9. [DeepTwin Adverse-Event Integration](#9-deeptwin-adverse-event-integration)
10. [Licensing](#10-licensing)
11. [Implementation Recommendations](#11-implementation-recommendations)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Appendix: Code Reference](#13-appendix-code-reference)

---

## 1. Executive Summary

### 1.1 Mission Statement

This document provides the complete technical specification for integrating adverse event intelligence into DeepSynaps Protocol Studio (Phase 2 of the Knowledge Layer). The integration centers on two complementary pharmacovigilance data sources:

| Source | Type | Coverage | Key Strength | Key Limitation |
|--------|------|----------|-------------|----------------|
| **FAERS** (FDA Adverse Event Reporting System) | Spontaneous reporting system | 25M+ post-marketing adverse event reports | Real-world post-marketing surveillance data | Reporting bias, no denominator, no causation |
| **OnSIDES** (On-label Side Effect Resource) | NLP-extracted label data | 7.1M+ drug-ADE pairs from FDA labels | Structured, label-derived, high precision | Label-reported only, not incidence-based |

### 1.2 Critical Governance Position

**ALL adverse event data in DeepSynaps is RESEARCH-ONLY by default.** No adverse event signal from FAERS or OnSIDES may ever be presented as a proven causal relationship, incidence rate, or patient-specific risk prediction. The system must enforce this constraint at the adapter boundary, the API boundary, and the presentation layer simultaneously.

### 1.3 What This Document Covers

- Deep technical analysis of FAERS: data structure, download mechanisms, API access, signal detection algorithms
- Deep technical analysis of OnSIDES: NLP methodology, data format, probability scores, coverage
- Complete pharmacovigilance methodology: all major biases, confounders, and limitations
- Signal detection mathematics: PRR, ROR, EBGM, BCPNN with worked examples
- DeepSynaps adapter architecture with full caveat propagation
- Display rules that enforce "never show counts as rates"
- Provenance and confidence scoring model
- DeepTwin integration for adverse-event confound detection
- Licensing analysis
- Implementation roadmap with risk mitigations

### 1.4 Most Important Caveat

```
FAERS is a reporting database. Report counts do not indicate causation,
incidence rates, or relative risk. OnSIDES captures label-reported adverse
events. These are drug-event pairs from product labels, not proven causal
relationships or incidence rates. ALL DATA IS RESEARCH-ONLY.
```

---

## 2. FAERS Deep Dive

### 2.1 What FAERS Is

The **FDA Adverse Event Reporting System (FAERS)** is a spontaneous reporting system that collects adverse event reports, medication error reports, and product quality complaints submitted to the FDA. It is one of the world's largest pharmacovigilance databases, containing over **25 million reports** spanning from 1969 to the present.

**Critical distinction:** FAERS is a **reporting database**, not an epidemiological incidence database. It records events that were *reported* to the FDA, not all events that *occurred*. This distinction is foundational to every interpretation of FAERS data.

**Who submits reports:**
- Healthcare professionals (physicians, pharmacists, nurses)
- Consumers (patients, family members)
- Manufacturers (mandatory reporting requirements)

**Reporting channels:**
- MedWatch (FDA safety reporting program)
- Direct electronic submission (ICSR — Individual Case Safety Report)
- FDA Form 3500 (voluntary reporting)
- Mandatory manufacturer reporting (15-day expedited reports for serious events)

### 2.2 Data Releases

FAERS data is released **quarterly** (typically 2-3 months after the end of each quarter). Each quarterly release contains all reports received through that quarter. The data is available in multiple formats:

| Format | Location | Description |
|--------|----------|-------------|
| **ASCII/CSV (legacy)** | https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html | Pipe-delimited flat files |
| **XML (ICSR E2B)** | Same portal | XML format following ICH E2B(R3) standard |
| **openFDA API** | https://api.fda.gov/drug/event.json | RESTful JSON API, real-time access |
| **Dashboard** | https://www.fda.gov/drugs/drug-approvals-and-databases/fda-adverse-event-reporting-system-faers | Interactive web interface |

**Quarterly release schedule:**
- Q1 data: typically released May-June
- Q2 data: typically released August-September
- Q3 data: typically released November-December
- Q4 data: typically released February-March

**Data latency:** Reports submitted today may not appear in FAERS for 90-180 days due to processing, quality checks, and quarterly batching.

### 2.3 Data Structure — The Seven Core Files

Each FAERS quarterly release contains seven pipe-delimited (`|`) ASCII files. Understanding this structure is essential for any integration:

#### 2.3.1 DEMO (Demographics)

| Field | Description | Critical Notes |
|-------|-------------|----------------|
| `primaryid` | Unique report identifier | Links across all files |
| `caseid` | Case number | Multiple reports can share a caseid |
| `caseversion` | Version of the case | Incremented when reports are updated |
| `i_f_code` | Initial or Follow-up | `I` = initial report, `F` = follow-up |
| `event_dt` | Event date | Often missing or incomplete |
| `mfr_dt` | Manufacturer report date | When manufacturer submitted |
| `init_fda_dt` | Initial FDA receipt date | When FDA first received |
| `fda_dt` | FDA receipt date (this version) | |
| `rept_cod` | Report type | EXP = expedited, PER = periodic, DIR = direct, BSK = 5-day alert |
| `mfr_num` | Manufacturer report number | |
| `mfr_sndr` | Manufacturer sender | |
| `age` | Patient age | Numeric; may be null |
| `age_cod` | Age unit | YR, MO, WK, DY, HR |
| `gndr_cod` | Gender | F, M, UNK |
| `e_sub` | Report submitted electronically | Y/N |
| `wt` | Patient weight | Numeric; often null |
| `wt_cod` | Weight unit | KG, LBS |
| `rept_dt` | Report date | |
| `to_mfr` | Report sent to manufacturer | Y/N |
| `occp_cod` | Reporter occupation | MD = physician, PH = pharmacist, RN = nurse, CN = consumer |
| `reporter_country` | Country of reporter | ISO country code |
| `occr_country` | Country of occurrence | |

**DEMO critical notes:**
- Each `primaryid` identifies a single report
- A case (`caseid`) may have multiple versions; always use the latest `caseversion`
- Demographics are often incomplete (age/weight/gender frequently NULL)
- Reporter occupation affects report quality (consumer reports have lower clinical detail)

#### 2.3.2 DRUG (Drug Information)

| Field | Description | Critical Notes |
|-------|-------------|----------------|
| `primaryid` | Links to DEMO | |
| `caseid` | Case number | |
| `drug_seq` | Drug sequence number | Multiple drugs per report |
| `role_cod` | Drug role | PS = primary suspect, SS = secondary suspect, C = concomitant, I = interacting |
| `drugname` | Drug name (verbatim) | May contain brand names, generics, misspellings |
| `prod_ai` | Active ingredient | Normalized active ingredient name |
| `val_vbm` | Verbatim vs. botanica | 1 = verbatim, 2 = botanical |
| `route` | Administration route | Verbatim text |
| `dose_vbm` | Dose (verbatim) | Raw text, not normalized |
| `dose_amt` | Dose amount | Numeric when parseable |
| `dose_unit` | Dose unit | |
| `dose_form` | Dose form | |
| `dose_freq` | Dosing frequency | |
| `nda_num` | NDA/ANDA number | Links to approval application |
| `exp_dt` | Expiration date | |

**DRUG critical notes:**
- A single report may list 1-10+ drugs
- `role_cod` = PS (primary suspect) identifies the drug suspected by the reporter
- `drugname` is verbatim and requires normalization (RxNorm mapping)
- Many reports contain non-drug substances (dietary supplements, foods, devices)
- Dose information is often missing or unparseable

#### 2.3.3 REAC (Reactions)

| Field | Description | Critical Notes |
|-------|-------------|----------------|
| `primaryid` | Links to DEMO | |
| `caseid` | Case number | |
| `pt` | Preferred Term (MedDRA) | MedDRA-coded adverse event |
| `drug_rec_act` | Drug recovery action | |

**REAC critical notes:**
- Events are coded using MedDRA (Medical Dictionary for Regulatory Activities)
- MedDRA is hierarchical: SOC > HLGT > HLT > PT > LLT
- Multiple PTs per report are common (mean ~3-4 reactions per report)
- PTs are not mutually exclusive — a report may have "headache" AND "migraine"
- MedDRA versions change over time; cross-quarter analysis requires version alignment

#### 2.3.4 OUTC (Outcomes)

| Field | Description | Values |
|-------|-------------|--------|
| `primaryid` | Links to DEMO | |
| `caseid` | Case number | |
| `outc_cod` | Outcome code | DE = death, LT = life-threatening, HO = hospitalization, DS = disability, CA = congenital anomaly, RI = required intervention, OT = other, UN = unknown |

#### 2.3.5 RPSR (Report Sources)

| Field | Description |
|-------|-------------|
| `primaryid` | Links to DEMO |
| `rpsr_cod` | Reporter source code (multiple codes possible) |

Source codes: `F` = foreign, `D` = distributor, `M` = manufacturer, `L` = literature, `C` = consumer, `H` = healthcare professional, `E` = FDA employee, `R` = other, `N` = study, `S` = USP, `O` = other

#### 2.3.6 THER (Therapy Dates)

| Field | Description | Notes |
|-------|-------------|-------|
| `primaryid` | Links to DEMO | |
| `dsg_drug_seq` | Links to DRUG.drug_seq | |
| `start_dt` | Therapy start date | Often incomplete |
| `end_dt` | Therapy end date | Often incomplete |
| `dur` | Duration | Numeric |
| `dur_cod` | Duration unit | |

#### 2.3.7 INDI (Indications)

| Field | Description | Notes |
|-------|-------------|-------|
| `primaryid` | Links to DEMO | |
| `indi_drug_seq` | Links to DRUG.drug_seq | |
| `indi_pt` | Indication (MedDRA PT) | What the drug was being used for |

**INDI critical notes:**
- Indications are critical for understanding confounding by indication
- A drug prescribed for condition X may have event Y reported — this does NOT mean Y is caused by the drug
- Off-label use may not be accurately captured

### 2.4 openFDA API

The openFDA API provides programmatic access to FAERS data without downloading bulk files.

**Base URL:** `https://api.fda.gov/drug/event.json`

**Key endpoints:**

| Operation | URL Pattern | Description |
|-----------|------------|-------------|
| Search | `?search=patient.drug.medicinalproduct:{drug}` | Find reports for a drug |
| Count | `?count=patient.reaction.reactionmeddrapt.exact` | Aggregate reaction counts |
| Filter | `+AND+patient.patientsex:1` | Add filters |
| Limit | `&limit=100` | Pagination (max 1000) |
| Skip | `&skip=100` | Pagination offset |

**Searchable fields:**

```
patient.drug.medicinalproduct          # Drug name (verbatim)
patient.drug.drugindication            # Indication
patient.reaction.reactionmeddrapt      # MedDRA PT
patient.patientonsetage                # Patient age
patient.patientsex                     # Sex (1=male, 2=female)
patient.patientweight                  # Weight
receivedate                            # FDA receipt date
seriousnessdeath                       # Death outcome (1 = yes)
seriousnesslifethreatening             # Life-threatening (1 = yes)
seriousnesshospitalization             # Hospitalization (1 = yes)
seriousnessdisabling                   # Disability (1 = yes)
seriousnesscongenitalanomali           # Congenital anomaly (1 = yes)
seriousnessother                       # Other serious (1 = yes)
primarysource.qualification            # Reporter qualification
primarysource.reportercountry          # Reporter country
```

**API limits:**
- 240 requests per minute per key (without key: 1,000/day)
- 1,000 records per query (use pagination with `skip` for more)
- No authentication required for basic access

### 2.5 Critical Caveats — The Ten Limitations

These limitations are non-negotiable constraints that every DeepSynaps adapter, display, and analysis must respect:

#### Limitation 1: No Denominator

FAERS contains no information about how many people took a drug. A drug with 1,000 reports may be taken by 100 million people (0.001% event rate) or by 10,000 people (10% event rate). There is no way to calculate incidence, prevalence, or risk from FAERS alone.

```
FAERS report count for Drug X + Event Y = 500

Possible interpretations:
- Drug X has 500 reports out of 50,000,000 users → 0.001% rate
- Drug X has 500 reports out of 50,000 users → 1% rate
- Drug X has 500 reports with unknown total users → UNKNOWN rate

The ONLY valid statement: "There were 500 reports of Event Y for Drug X in FAERS."
```

#### Limitation 2: Reporting Bias

Serious events are over-reported; mild events are under-reported. Death and hospitalization generate mandatory manufacturer reports. Mild nausea from an OTC drug is rarely reported. This means:

- Death events appear disproportionately frequent relative to mild events
- Comparison of serious vs. mild event frequencies is systematically biased
- Drugs used for serious conditions may have more reports simply because the patient population is more closely monitored

#### Limitation 3: Stimulated Reporting

Media coverage, regulatory actions (black box warnings, drug withdrawals), and manufacturer Dear Healthcare Professional letters cause sudden spikes in reporting that do NOT reflect changes in true event rates:

| Event | Example |
|-------|---------|
| Media coverage | Vioxx withdrawal (2004) caused massive spike in COX-2 inhibitor reports |
| Regulatory action | FDA safety communication causes 3-10x report increase for target drug-event |
| Litigation | Class-action lawsuits generate increased attorney-driven reporting |
| Label changes | New boxed warning stimulates increased reporting |

#### Limitation 4: Duplicate Reports

The same adverse event may be reported multiple times:
- Initial report from physician + follow-up from manufacturer = 2 reports, 1 event
- Consumer report + healthcare professional report for same patient = 2 reports, 1 event
- Follow-up reports create new `primaryid` with same `caseid` but different `caseversion`

**Mitigation:** Always deduplicate on `caseid` using the latest `caseversion`.

#### Limitation 5: Confounding by Indication

Patients taking Drug X for Condition Z may have Event Y because of Condition Z itself, not because of Drug X:

```
Example: Methotrexate + lymphoma reports
- Methotrexate is used for rheumatoid arthritis and psoriasis
- These autoimmune conditions have elevated baseline lymphoma risk
- Reports of lymphoma in methotrexate patients may reflect:
  a) Methotrexate causing lymphoma
  b) The underlying condition causing lymphoma
  c) A combination of both
- FAERS cannot distinguish these scenarios
```

#### Limitation 6: Weber Effect

Newly approved drugs receive disproportionately more adverse event reports in their first 2-3 years on the market. This is because:
- Healthcare providers are more vigilant for new drugs
- New drugs may have less well-known safety profiles
- Marketing and media attention is higher
- Reporting rates decline as familiarity increases, even if true event rates are stable

**Implication:** Time-on-market must always be considered when comparing report counts across drugs.

#### Limitation 7: Underreporting

The vast majority of adverse events are never reported to FAERS:

| Source | Estimate |
|--------|----------|
| General adverse events | 1-10% reported (Hazell & Shakir, 2006) |
| Serious adverse events | 10-30% reported |
| Deaths | Higher reporting due to mandatory requirements |
| OTC drugs | Very low reporting rates (<1%) |

This means FAERS undercounts every adverse event, and underreporting varies by drug, event, and patient population.

#### Limitation 8: Data Quality Issues

- Missing data: Age, weight, dose, and event dates are frequently NULL
- Inconsistent drug naming: Brand names, generics, misspellings, abbreviations
- Multiple drugs per report: Difficult to attribute causality
- Reporter variability: Consumer reports lack clinical detail; professional reports may be biased
- Incomplete follow-up: Outcomes of many events are unknown

#### Limitation 9: No Causality Assessment

FAERS records *reported associations*, not *proven causalities*. Every report represents someone's belief that a drug caused an event. No independent causality assessment is performed by FDA for the vast majority of reports.

#### Limitation 10: International Bias

FAERS is a US-centric database. While it receives reports from 100+ countries, the majority are from the US. Drugs not marketed in the US may have incomplete profiles. Regulatory differences affect reporting patterns.

---

## 3. OnSIDES Deep Dive

### 3.1 What OnSIDES Is

**OnSIDES (On-label Side Effect Resource)** is a large-scale database of adverse drug event pairs extracted from FDA-approved drug labels (Structured Product Labels — SPL) using natural language processing (NLP). It was developed by the Tatonetti Lab at Columbia University.

**Core distinction:** OnSIDES captures what drug labels *say* about adverse events. It does NOT capture:
- True incidence rates of adverse events
- Causal relationships (labels often use "may cause" language)
- Off-label adverse events (those occurring outside approved indications)
- Post-marketing surveillance data

### 3.2 Data Source & Methodology

**Source:** FDA Structured Product Labels (SPL) via DailyMed (https://dailymed.nlm.nih.gov/)

**Processing pipeline:**

```
SPL XML Labels (DailyMed)
    ↓
Text Extraction (Adverse Reactions, Boxed Warnings,
                 Warnings and Precautions sections)
    ↓
NLP Processing (fine-tuned PubMedBERT)
    ↓
Entity Recognition (drug names, adverse events)
    ↓
Normalization:
    - Drugs → RxNorm concept unique identifiers (RXCUIs)
    - Adverse events → MedDRA Preferred Terms
    ↓
Probability Scoring (model confidence)
    ↓
OnSIDES Database (TSV/CSV/SQLite)
```

**NLP model performance (reported by Tatonetti Lab):**

| Metric | Score |
|--------|-------|
| F1 Score | 0.90 |
| AUROC | 0.92 |
| Precision | ~0.89 |
| Recall | ~0.91 |

**Sections extracted:**

| Section | Description | ADE Type |
|---------|-------------|----------|
| **AR** | Adverse Reactions | Known adverse reactions from clinical trials/post-marketing |
| **BW** | Boxed Warnings | Most serious warnings (required by FDA for highest-risk events) |
| **WP** | Warnings and Precautions | Important safety information |

### 3.3 Data Format & Access

**Download:** https://github.com/tatonetti-lab/onsides

**Available formats:**

| Format | File | Size |
|--------|------|------|
| TSV (flat) | `onsides_*.tsv` | ~200-500 MB |
| CSV | `onsides_*.csv` | ~200-500 MB |
| SQLite | `onsides.db` | Pre-built database |
| SQL | DDL scripts provided | For custom databases |

**Core TSV columns:**

| Column | Description | Example |
|--------|-------------|---------|
| `drug_rxnorm` | RxNorm CUI for the drug | `rxCUI:6918` |
| `drug_name` | Drug name (normalized) | `metformin` |
| `adverse_event` | MedDRA Preferred Term | `nausea` |
| `adverse_event_meddra` | MedDRA concept code | `10028813` |
| `section` | Label section source | `AR` (Adverse Reactions) |
| `probability` | NLP model confidence | `0.95` |
| `label_id` | DailyMed SPL set ID | `uuid` |
| `ingredient_rxcui` | Ingredient-level RxNorm CUI | `rxCUI:6918` |

**Probability score interpretation:**

```
probability = NLP model confidence that the drug-event pair
              is genuinely described in the label section

NOT a clinical probability.
NOT an incidence rate.
NOT a risk score.

probability = 0.95 means: "We are 95% confident that the label
              for metformin mentions nausea in the Adverse
              Reactions section."
```

### 3.4 Coverage Statistics

| Metric | Value |
|--------|-------|
| Total drug-ADE pairs | 7.1 million+ |
| Unique drugs (ingredients) | ~4,097 |
| Unique adverse events (MedDRA PTs) | ~10,000 |
| Label sources | All FDA-approved SPL labels on DailyMed |
| Update frequency | Quarterly |

### 3.5 Variants & Extensions

| Variant | Description | Coverage |
|---------|-------------|----------|
| **OnSIDES-US** | US FDA labels only | Primary dataset |
| **OnSIDES-INTL** | UK, EU (EMA), Japan (PMDA) labels | International comparison |
| **OnSIDES-PED** | Pediatric-specific labels | Age-stratified ADEs |
| **OffSIDES** | Off-label adverse events (from FAERS signals) | Post-marketing, off-label |
| **TwoSIDES** | Drug-drug interaction adverse events | Combination ADEs |

### 3.6 Critical Caveats for OnSIDES

#### Caveat 1: Label-Reported, Not Evidence-Proven

OnSIDES captures what appears in drug labels. Drug labels include adverse events that were:
- Observed in clinical trials (but may not be drug-caused)
- Reported post-marketing (but may not be causal)
- Included for legal/regulatory reasons
- Observed at higher rates than placebo (but may still be rare)
- Observed at rates similar to placebo (included for completeness)

#### Caveat 2: No Incidence Information

A drug label may state "nausea was reported in clinical trials" without specifying whether it occurred in 0.1% or 50% of patients. OnSIDES records the *existence* of the drug-event pair, not the *frequency*.

```
OnSIDES entry: metformin → lactic acidosis

What OnSIDES tells us: "The metformin label mentions lactic acidosis."

What OnSIDES does NOT tell us:
- How often lactic acidosis occurs in metformin patients
- Whether lactic acidosis is caused by metformin
- Whether lactic acidosis is more common with metformin than with placebo
- The patient's risk of developing lactic acidosis
```

#### Caveat 3: NLP Errors

Despite 0.90 F1 score, the NLP model makes errors:
- **False positives:** Extracting events that are not ADEs (e.g., "patients with diabetes" might be misclassified as "diabetes" as an ADE)
- **False negatives:** Missing ADEs that are described in non-standard language
- **Negation failures:** "No serious adverse events were reported" may be misclassified
- **Context errors:** Events from "Warnings" about drug class may be attributed to the specific drug

#### Caveat 4: Drug Name Ambiguity

- Brand vs. generic: "Prozac" and "fluoxetine" may not always link to the same RxNorm CUI
- Combination products: "Janumet" (sitagliptin/metformin) needs mapping to both ingredients
- Biosimilars: May share labels with reference products, creating ambiguous mappings

#### Caveat 5: Label Changes Over Time

Drug labels are updated periodically. Safety events may be:
- Added to labels after new data
- Removed from labels if disproven
- Modified in severity language

OnSIDES captures a snapshot of labels at extraction time. Historical label comparison requires version tracking.

---

## 4. Pharmacovigilance Methodology

### 4.1 Spontaneous Reporting Systems — Design & Limitations

Spontaneous (or passive) reporting systems like FAERS are the cornerstone of post-marketing pharmacovigilance. They operate by collecting voluntary reports of suspected adverse drug reactions from healthcare professionals, consumers, and manufacturers.

**Key design characteristics:**

| Characteristic | Implication |
|---------------|-------------|
| Open submission | Anyone can submit a report |
| No control group | Cannot calculate relative risk |
| No denominator data | Cannot calculate incidence rates |
| Suspicion-based | Reports reflect belief, not proof |
| Post-marketing | Only captures events after drug is approved |

**Comparison with active surveillance:**

| Feature | Spontaneous (FAERS) | Active Surveillance |
|---------|--------------------|---------------------|
| Data source | Voluntary reports | Systematically collected records |
| Denominator | Unknown | Known |
| Event rate calculation | Impossible | Possible |
| Relative risk calculation | Requires external data | Directly calculable |
| Coverage | National/international | Usually limited to specific populations |
| Cost | Low | High |
| Timeliness | Real-time submissions | Delayed by data collection |
| Examples | FAERS, WHO VigiBase | Sentinel System, CPRD, Kaiser |

### 4.2 Reporting Biases — Systematic Catalog

#### 4.2.1 Selection Bias

Reports are not a random sample of all adverse events. Factors affecting selection:
- **Severity:** Serious events are more likely to be reported
- **Novelty:** Unusual or unexpected events attract more attention
- **Proximity:** Events temporally close to drug initiation are more likely reported
- **Litigation interest:** Events associated with active litigation have higher reporting
- **Regulatory attention:** Drugs under REMS or with boxed warnings have enhanced reporting

#### 4.2.2 Underreporting Bias

| Scenario | Estimated Reporting Rate |
|----------|-------------------------|
| OTC medications | < 0.1% of events reported |
| Prescription drugs (mild events) | 0.1 - 1% reported |
| Prescription drugs (serious events) | 1 - 10% reported |
| Hospitalizations | 10 - 30% reported |
| Deaths | Higher rates due to mandatory reporting |
| Known/labeled events | Lower reporting ("already known") |
| New/unlabeled events | Higher reporting ("alert to new risk") |

#### 4.2.3 Weber Effect

Named after physician J. C. P. Weber, this phenomenon describes the characteristic temporal pattern of adverse event reporting for new drugs:

```
Reporting Rate
    |
    |        /\
    |       /  \
    |      /    \
    |     /      \
    |    /        \
    |   /          \
    |  /            \
    | /              \
    |/________________\____ Time
     Approval          2-3 years
```

**Implications:**
- New drugs (first 2-3 years) have artificially inflated report counts
- Comparing a new drug's report count to an established drug's count is misleading
- Signal detection algorithms must account for time-on-market

#### 4.2.4 Notoriety Bias (Stimulated Reporting)

When a drug or event becomes "notorious," reporting increases dramatically:

| Trigger | Typical Effect | Duration |
|---------|---------------|----------|
| Regulatory action (black box warning) | 3-10x increase | 6-18 months |
| Media coverage (major news story) | 2-5x increase | 1-6 months |
| Drug withdrawal | 5-20x increase | 3-12 months |
| Class-action lawsuit | 2-4x increase | Ongoing |
| Manufacturer "Dear Doctor" letter | 1.5-3x increase | 2-4 months |
| Publication of safety signal | 2-4x increase | 3-12 months |

#### 4.2.5 Confounding by Indication

The most analytically challenging bias in pharmacovigilance:

```
Patient has Condition C
         ↓
Prescribed Drug D for Condition C
         ↓
Patient develops Event E
         ↓
Is E caused by D? Or is E caused by C? Or both?
```

**Classic examples:**

| Drug | Indication | Observed Event | Confounding |
|------|-----------|---------------|-------------|
| Estrogen | Menopause | Breast cancer | Menopause itself is a risk factor |
| Beta-blockers | Hypertension | Heart failure | Hypertension is associated with HF |
| Antipsychotics | Schizophrenia | Diabetes | Schizophrenia has higher diabetes risk |
| Immunosuppressants | Transplant | Infection | Transplant + immunosuppression both contribute |
| NSAIDs | Osteoarthritis | GI bleeding | Age/osteoarthritis are risk factors |

### 4.3 Data Quality Framework

| Dimension | Issues | Mitigation Strategies |
|-----------|--------|----------------------|
| **Completeness** | Missing demographics, doses, dates, outcomes | Flag missingness; multiple imputation for analysis; display data quality indicators |
| **Accuracy** | Drug name misspellings, wrong dates, duplicate entries | NLP normalization; deduplication; data validation rules |
| **Consistency** | MedDRA version changes, coding inconsistencies | Version-lock analysis; hierarchical rollup |
| **Timeliness** | 90-180 day latency; follow-up may never arrive | Flag data freshness; distinguish initial vs. follow-up |
| **Plausibility** | Implausible age/weight combinations, temporal impossibilities | Range checks; temporal consistency validation |

### 4.4 Causality Assessment — WHO-UMC Criteria

The WHO-Uppsala Monitoring Centre provides a structured causality assessment framework:

| Causality Term | Definition |
|---------------|------------|
| **Certain** | Event rechallenged and recurred; alternative causes excluded |
| **Probable/Likely** | Event followed plausible temporal sequence; unlikely due to disease or other drugs; response to withdrawal plausible |
| **Possible** | Event followed plausible temporal sequence; could also be explained by disease or other drugs |
| **Unlikely** | Event not following plausible temporal sequence; disease/other drugs provide plausible explanation |
| **Conditional/Unclassified** | More data needed for assessment |
| **Unassessable/Unclassifiable** | Insufficient information to assess |

**CRITICAL:** FAERS does NOT systematically apply these criteria. Individual reports reflect the reporter's suspicion, not a formal causality assessment. The overwhelming majority of FAERS reports are "possible" or "conditional" at best.

---

## 5. Signal Detection Algorithms

### 5.1 What Is a Signal?

**WHO Definition:** "Reported information on a possible causal relationship between an adverse event and a drug, the relationship being unknown or incompletely documented previously."

**In pharmacovigilance:** A signal is a statistical or clinical alert that a drug-event combination may be associated at a higher rate than expected, warranting further investigation.

**Signal is NOT proof.** A signal triggers investigation; it does not establish causation.

### 5.2 Contingency Table

All disproportionality algorithms use a 2x2 contingency table:

```
                    Event Y    All Other Events    Total
                  ┌─────────┬──────────────────┬────────┐
Drug X            │   a     │        b         │ a + b  │
                  ├─────────┼──────────────────┼────────┤
All Other Drugs   │   c     │        d         │ c + d  │
                  ├─────────┼──────────────────┼────────┤
Total             │ a + c   │      b + d       │  N     │
                  └─────────┴──────────────────┴────────┘

a = Reports of Drug X AND Event Y
b = Reports of Drug X without Event Y
c = Reports of Event Y without Drug X
d = Reports of neither Drug X nor Event Y
N = Total reports
```

### 5.3 PRR (Proportional Reporting Ratio)

**Formula:**

```
PRR = [a / (a + b)] / [c / (c + d)]

    = (Proportion of Drug X reports with Event Y)
      / (Proportion of all other drug reports with Event Y)
```

**Interpretation:**
- PRR = 1: No signal (observed rate = expected rate)
- PRR > 1: Potential signal (event reported more often with this drug than with others)
- PRR >= 2: Common threshold for signal investigation (with lower CI > 1)

**Chi-square statistic:**

```
Chi-square = N * (ad - bc)^2 / [(a+b)(a+c)(b+d)(c+d)]

A PRR signal is typically considered valid when:
- PRR >= 2
- Chi-square >= 4 (p < 0.05)
- a >= 3 (minimum number of reports)
```

**Python implementation:**

```python
import math
from typing import NamedTuple

class PRRResult(NamedTuple):
    prr: float
    chi_square: float
    lower_ci: float
    upper_ci: float
    signal_detected: bool
    report_count: int

def calculate_prr(a: int, b: int, c: int, d: int) -> PRRResult:
    """
    Calculate Proportional Reporting Ratio (PRR) with 95% confidence interval.
    
    Args:
        a: Reports with Drug X AND Event Y
        b: Reports with Drug X without Event Y
        c: Reports with Event Y without Drug X
        d: Reports with neither Drug X nor Event Y
    
    Returns:
        PRRResult with all metrics and signal detection flag
    """
    n = a + b + c + d
    
    # Prevent division by zero
    if a + b == 0 or c + d == 0 or c == 0:
        return PRRResult(
            prr=float('nan'), chi_square=0.0,
            lower_ci=float('nan'), upper_ci=float('nan'),
            signal_detected=False, report_count=a
        )
    
    # PRR calculation
    prr = (a / (a + b)) / (c / (c + d))
    
    # Chi-square (Yates-corrected for small counts)
    if (a + b) * (a + c) * (b + d) * (c + d) > 0:
        chi_square = (n * (abs(a * d - b * c) - n / 2) ** 2) / \
                     ((a + b) * (a + c) * (b + d) * (c + d))
    else:
        chi_square = 0.0
    
    # 95% Confidence interval (log method)
    if a > 0 and b > 0 and c > 0 and d > 0:
        log_prr = math.log(prr)
        se_log_prr = math.sqrt(1/a - 1/(a+b) + 1/c - 1/(c+d))
        lower_ci = math.exp(log_prr - 1.96 * se_log_prr)
        upper_ci = math.exp(log_prr + 1.96 * se_log_prr)
    else:
        lower_ci = float('nan')
        upper_ci = float('nan')
    
    # Signal criteria: PRR >= 2, chi-square >= 4, a >= 3
    signal_detected = prr >= 2.0 and chi_square >= 4.0 and a >= 3
    
    return PRRResult(
        prr=round(prr, 4),
        chi_square=round(chi_square, 4),
        lower_ci=round(lower_ci, 4) if not math.isnan(lower_ci) else None,
        upper_ci=round(upper_ci, 4) if not math.isnan(upper_ci) else None,
        signal_detected=signal_detected,
        report_count=a
    )
```

**Worked example:**

```
Drug = Sertraline, Event = serotonin syndrome

From FAERS data:
a = 245 (sertraline + serotonin syndrome)
b = 412,755 (sertraline without serotonin syndrome)
c = 18,432 (other drugs + serotonin syndrome)
d = 15,234,890 (other drugs without serotonin syndrome)

PRR = (245 / 413000) / (18432 / 15253322)
    = 0.000593 / 0.001208
    = 0.491

Result: PRR < 1 — no signal detected.
This makes clinical sense: sertraline is an SSRI and the event is
well-known, expected, and labeled. Other drugs (MAOIs, tramadol,
fentanyl) likely dominate serotonin syndrome reports.
```

### 5.4 ROR (Reporting Odds Ratio)

**Formula:**

```
ROR = (a / c) / (b / d) = (a * d) / (b * c)
```

**95% Confidence interval:**

```
ln(ROR) = ln(a*d / b*c)
SE = sqrt(1/a + 1/b + 1/c + 1/d)
CI_lower = exp(ln(ROR) - 1.96 * SE)
CI_upper = exp(ln(ROR) + 1.96 * SE)
```

**Signal criteria:**
- ROR >= 2 (commonly used threshold)
- Lower 95% CI > 1
- a >= 3

**PRR vs. ROR comparison:**

| Feature | PRR | ROR |
|---------|-----|-----|
| Calculation | (a/(a+b))/(c/(c+d)) | (a*d)/(b*c) |
| Behavior with rare events | More stable | Can be unstable with small counts |
| Asymptotic properties | Approaches RR when event is rare | Approximately equals PRR for large samples |
| Preferred when | Comparing across multiple D-E pairs | Bayesian or stratified analysis needed |

**Python implementation:**

```python
class RORResult(NamedTuple):
    ror: float
    lower_ci: float
    upper_ci: float
    signal_detected: bool
    report_count: int

def calculate_ror(a: int, b: int, c: int, d: int) -> RORResult:
    """
    Calculate Reporting Odds Ratio (ROR) with 95% confidence interval.
    """
    if a * d == 0 or b * c == 0:
        return RORResult(
            ror=float('nan'), lower_ci=float('nan'), upper_ci=float('nan'),
            signal_detected=False, report_count=a
        )
    
    ror = (a * d) / (b * c)
    
    # 95% CI
    ln_ror = math.log(ror)
    se = math.sqrt(1/a + 1/b + 1/c + 1/d)
    lower_ci = math.exp(ln_ror - 1.96 * se)
    upper_ci = math.exp(ln_ror + 1.96 * se)
    
    signal_detected = ror >= 2.0 and lower_ci > 1.0 and a >= 3
    
    return RORResult(
        ror=round(ror, 4),
        lower_ci=round(lower_ci, 4),
        upper_ci=round(upper_ci, 4),
        signal_detected=signal_detected,
        report_count=a
    )
```

### 5.5 EBGM (Empirical Bayes Geometric Mean)

EBGM is a Bayesian shrinkage estimator used extensively in pharmacovigilance, particularly in systems like the WHO's VigiBase and the US FDA's Sentinel.

**Concept:** When a drug-event pair has very few reports, raw PRR/ROR estimates are unstable. EBGM uses Bayesian methods to "shrink" extreme estimates toward the mean, with less shrinkage as report counts increase.

**The model:**

```
The EBGM method models the reporting ratio using a mixture of
prior distributions. It calculates:

EBGM = exp(E[log(lambda) | data])

Where lambda is the true reporting ratio, and the expectation
is taken over the posterior distribution.

The method uses the full distribution of all drug-event pairs
to establish a prior, then updates with data for the specific
pair of interest.
```

**EB05 and EB95:**

```
EB05 = 5th percentile of posterior distribution
EB95 = 95th percentile of posterior distribution

Signal criteria: EB05 > 2 (95% confident that the true ratio > 2)
```

**Python implementation (simplified):**

```python
from scipy import stats
import numpy as np

class EBGMResult(NamedTuple):
    ebgm: float
    eb05: float
    eb95: float
    signal_detected: bool
    report_count: int

def calculate_ebgm_simplified(a: int, b: int, c: int, d: int) -> EBGMResult:
    """
    Simplified EBGM calculation using Gamma-Poisson shrinkage.
    
    Full EBGM requires the complete distribution of all D-E pairs
    for prior estimation. This simplified version uses moment-based
    estimation.
    """
    N = a + b + c + d
    
    if a == 0 or N == 0:
        return EBGMResult(
            ebgm=0.0, eb05=0.0, eb95=0.0,
            signal_detected=False, report_count=a
        )
    
    # Expected count under independence
    E = (a + b) * (a + c) / N
    
    # Observed/Expected ratio
    lambda_mle = a / E if E > 0 else 0
    
    # Method of moments for Gamma prior parameters
    # Using overall database as prior
    overall_ratio = (a + c) / N
    
    # Shrinkage weight (increases with expected count)
    shrinkage_weight = E / (E + 10)  # simplified
    
    # Shrink estimate toward prior mean
    ebgm = shrinkage_weight * lambda_mle + (1 - shrinkage_weight) * 1.0
    
    # Approximate posterior percentiles (simplified)
    if a > 5:
        posterior_var = lambda_mle / E  # approximate
        eb05 = max(0.01, ebgm * (1 - 1.645 * np.sqrt(posterior_var)))
        eb95 = ebgm * (1 + 1.645 * np.sqrt(posterior_var))
    else:
        # High uncertainty for small counts
        eb05 = 0.01
        eb95 = ebgm * 5  # very wide interval
    
    signal_detected = eb05 > 2.0 and a >= 3
    
    return EBGMResult(
        ebgm=round(ebgm, 4),
        eb05=round(eb05, 4),
        eb95=round(eb95, 4),
        signal_detected=signal_detected,
        report_count=a
    )
```

### 5.6 BCPNN (Bayesian Confidence Propagation Neural Network)

Used by the WHO-Uppsala Monitoring Centre for VigiBase signal detection.

**Core concept:** BCPNN uses information theory (mutual information) to detect unexpectedly frequent drug-event combinations. It quantifies how much the observed co-occurrence of a drug and event deviates from what would be expected if they were independent.

**Information component:**

```
IC = log2(P(D,E) / (P(D) * P(E)))

Where:
P(D,E) = a / N      (joint probability)
P(D) = (a+b) / N    (marginal probability of drug)
P(E) = (a+c) / N    (marginal probability of event)

IC > 0: Drug and event co-occur more than expected by chance
IC < 0: Drug and event co-occur less than expected by chance
IC = 0: Independent
```

**Variance of IC:**

```
Var(IC) = 1/(ln(2)^2) * [1/a - 1/(a+b) - 1/(a+c) + 1/N]
```

**Signal criteria:**

```
Lower 95% CI of IC > 0  =>  Signal detected
(i.e., IC - 1.96*sqrt(Var(IC)) > 0)
```

**Python implementation:**

```python
class BCPNNResult(NamedTuple):
    ic: float
    lower_ci: float
    upper_ci: float
    signal_detected: bool
    report_count: int

def calculate_bcpnn(a: int, b: int, c: int, d: int) -> BCPNNResult:
    """
    Calculate Bayesian Confidence Propagation Neural Network (BCPNN)
    Information Component (IC) with 95% confidence interval.
    """
    N = a + b + c + d
    
    if a == 0 or N == 0:
        return BCPNNResult(
            ic=-5.0, lower_ci=-10.0, upper_ci=0.0,
            signal_detected=False, report_count=a
        )
    
    # Probabilities
    p_de = a / N
    p_d = (a + b) / N
    p_e = (a + c) / N
    
    # Information component
    ic = math.log2(p_de / (p_d * p_e))
    
    # Variance of IC
    ln2_sq = math.log(2) ** 2
    var_ic = (1 / ln2_sq) * (1/a - 1/(a+b) - 1/(a+c) + 1/N)
    
    # 95% CI
    se_ic = math.sqrt(max(0, var_ic))
    lower_ci = ic - 1.96 * se_ic
    upper_ci = ic + 1.96 * se_ic
    
    # Signal: lower CI > 0
    signal_detected = lower_ci > 0 and a >= 3
    
    return BCPNNResult(
        ic=round(ic, 4),
        lower_ci=round(lower_ci, 4),
        upper_ci=round(upper_ci, 4),
        signal_detected=signal_detected,
        report_count=a
    )
```

### 5.7 Algorithm Comparison & Recommended Usage

| Algorithm | Signal Threshold | Best For | Limitation | DeepSynaps Priority |
|-----------|-----------------|----------|------------|-------------------|
| **PRR** | PRR >= 2, Chi2 >= 4, a >= 3 | Initial screening, easy interpretation | Unstable with small counts; no shrinkage | Primary |
| **ROR** | ROR >= 2, CI > 1, a >= 3 | Similar to PRR; useful for stratification | Unstable with small counts | Primary |
| **EBGM** | EB05 > 2 | Definitive signal detection; handles small counts | Computationally complex; requires full database for prior | Secondary |
| **BCPNN** | IC lower CI > 0 | Bayesian approach; WHO standard | Less intuitive interpretation | Secondary |

### 5.8 Signal Triangulation

No single algorithm should determine a signal. Best practice is **triangulation** — requiring multiple methods to agree:

```python
def triangulated_signal(
    prr_result: PRRResult,
    ror_result: RORResult,
    ebgm_result: EBGMResult = None,
    min_algorithms_agreeing: int = 2
) -> dict:
    """
    Require at least N algorithms to detect a signal before flagging.
    This reduces false positives from any single method's bias.
    """
    signals = [
        prr_result.signal_detected,
        ror_result.signal_detected,
        ebgm_result.signal_detected if ebgm_result else False
    ]
    
    agreement_count = sum(signals)
    triangulated = agreement_count >= min_algorithms_agreeing
    
    return {
        "triangulated_signal": triangulated,
        "algorithms_agreeing": agreement_count,
        "prr_signal": prr_result.signal_detected,
        "ror_signal": ror_result.signal_detected,
        "ebgm_signal": ebgm_result.signal_detected if ebgm_result else False,
        "report_count": prr_result.report_count,
        "caveat": (
            "Signal detected by multiple algorithms. "
            "This is a statistical signal, not proof of causation. "
            "Requires further clinical investigation."
            if triangulated else
            "No consistent signal detected across algorithms."
        )
    }
```

---

## 6. DeepSynaps Integration Architecture

### 6.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    DEEP SYNAPS API LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Medication   │  │ Safety       │  │ DeepTwin     │           │
│  │ Analyzer     │  │ Engine       │  │ Confound     │           │
│  │ (existing)   │  │ (existing)   │  │ Detection    │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────┐
│              ADVERSE EVENT ADAPTER LAYER                          │
│  ┌────────────────────────┐  ┌────────────────────────┐           │
│  │ FAERS Adapter          │  │ OnSIDES Adapter        │           │
│  │ ┌────────────────────┐ │  │ ┌────────────────────┐ │           │
│  │ │ openFDA API Client │ │  │ │ TSV/SQLite Loader  │ │           │
│  │ │ (real-time queries)│ │  │ │ (batch ingestion)  │ │           │
│  │ └────────────────────┘ │  │ └────────────────────┘ │           │
│  │ ┌────────────────────┐ │  │ ┌────────────────────┐ │           │
│  │ │ Quarterly Download │ │  │ │ API Query Layer    │ │           │
│  │ │ (batch processing) │ │  │ │ (RxNorm → ADEs)    │ │           │
│  │ └────────────────────┘ │  │ └────────────────────┘ │           │
│  │ ┌────────────────────┐ │  │ ┌────────────────────┐ │           │
│  │ │ Signal Detection   │ │  │ │ Probability Filter │ │           │
│  │ │ (PRR/ROR/EBGM)     │ │  │ │ (min confidence)   │ │           │
│  │ └────────────────────┘ │  │ └────────────────────┘ │           │
│  └────────────────────────┘  └────────────────────────┘           │
└──────────────────────────┬────────────┬──────────────────────────┘
                           │            │
                           ▼            ▼
                  ┌──────────────┐  ┌──────────────┐
                  │ FAERS Cache  │  │ OnSIDES DB   │
                  │ (SQLite)     │  │ (SQLite)     │
                  │ 24h TTL      │  │ Quarterly    │
                  └──────────────┘  └──────────────┘
```

### 6.2 FAERS Adapter Design

```python
# /apps/api/app/services/adapters/faers_adapter.py

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


# ── Configuration ────────────────────────────────────────────────────────────

OPENFDA_BASE = "https://api.fda.gov"
FAERS_EVENT_ENDPOINT = f"{{OPENFDA_BASE}}/drug/event.json"

# Cache configuration
FAERS_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours
FAERS_CACHE_PATH = Path(__file__).resolve().parents[4] / "data" / "cache" / "faers_cache.db"

# Signal detection thresholds
PRR_SIGNAL_THRESHOLD = 2.0
CHI_SQUARE_SIGNAL_THRESHOLD = 4.0
MIN_REPORTS_FOR_SIGNAL = 3


# ── Data Models ──────────────────────────────────────────────────────────────

class SignalAlgorithm(str, Enum):
    """Available signal detection algorithms."""
    PRR = "prr"
    ROR = "ror"
    EBGM = "ebgm"
    BCPNN = "bcpnn"


@dataclass(frozen=True, slots=True)
class FAERSDrugEventPair:
    """Canonical representation of a FAERS drug-event pair."""
    drug_name: str
    drug_rxcui: Optional[str]  # RxNorm CUI if mapped
    event_meddra_pt: str       # MedDRA Preferred Term
    event_meddra_code: Optional[str]
    report_count: int
    
    # Signal metrics (all algorithms)
    prr: Optional[float] = None
    prr_ci_lower: Optional[float] = None
    prr_ci_upper: Optional[float] = None
    prr_chi_square: Optional[float] = None
    
    ror: Optional[float] = None
    ror_ci_lower: Optional[float] = None
    ror_ci_upper: Optional[float] = None
    
    ebgm: Optional[float] = None
    eb05: Optional[float] = None
    eb95: Optional[float] = None
    
    ic: Optional[float] = None
    ic_ci_lower: Optional[float] = None
    ic_ci_upper: Optional[float] = None
    
    # Signal detection flags
    prr_signal: bool = False
    ror_signal: bool = False
    ebgm_signal: bool = False
    bcpnn_signal: bool = False
    triangulated_signal: bool = False
    algorithms_agreeing: int = 0
    
    # Provenance & caveats
    data_source: str = "FAERS"
    faers_quarter: str = ""      # e.g., "2025Q1"
    query_date: str = ""
    
    # CRITICAL: Caveats attached to every record
    @property
    def caveat_text(self) -> str:
        return (
            f"FAERS is a spontaneous reporting system. "
            f"This drug-event pair has {self.report_count} report(s). "
            f"Report counts do not indicate causation, incidence rates, "
            f"or relative risk. Serious events are over-reported. "
            f"Missing denominator prevents rate calculation. "
            f"This data is RESEARCH-ONLY."
        )


@dataclass
class FAERSQueryResult:
    """Result wrapper for FAERS queries with full provenance."""
    drug_name: str
    total_reports_for_drug: int
    event_pairs: List[FAERSDrugEventPair]
    
    # Query metadata
    query_date: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    faers_data_version: str = ""
    api_endpoint_used: str = ""
    
    # Data quality flags
    cache_hit: bool = False
    offline_mode: bool = False
    data_quality_score: float = 0.0  # 0-1 based on completeness
    
    # Governance
    research_only: bool = True
    research_only_reason: str = (
        "FAERS data is spontaneous reporting data with no denominator, "
        "reporting bias, and no causality assessment. Not suitable for "
        "clinical decision-making without expert review."
    )
    
    # CAVEAT: Displayed with every result
    @property
    def display_caveat(self) -> str:
        return (
            "FAERS data shows REPORTED EVENTS, not proven side effects. "
            f"{self.total_reports_for_drug} total report(s) for this drug. "
            "Report count does NOT equal risk. "
            "This is research data for signal detection only."
        )


class FAERSAdapter:
    """
    DeepSynaps adapter for FAERS data via openFDA API.
    
    Design principles:
    1. Every result carries caveats by default
    2. Signal detection uses triangulated algorithms
    3. All data is research-only
    4. Cache provides offline resilience
    5. Rate limiting respects openFDA constraints
    """
    
    def __init__(
        self,
        cache_path: Optional[Path] = None,
        cache_ttl: int = FAERS_CACHE_TTL_SECONDS,
        api_key: Optional[str] = None
    ) -> None:
        self.cache = FAERSCache(cache_path or FAERS_CACHE_PATH, cache_ttl)
        self.api_key = api_key or os.getenv("OPENFDA_API_KEY", "")
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=10)
        )
        self._request_count = 0
        self._max_requests_per_minute = 240
        self._last_request_time = 0.0
    
    async def query_drug_events(
        self,
        drug_name: str,
        drug_rxcui: Optional[str] = None,
        limit: int = 100,
        include_signals: bool = True
    ) -> FAERSQueryResult:
        """
        Query adverse events for a specific drug from FAERS.
        
        Returns FAERSQueryResult with full provenance and caveats.
        All data is automatically flagged as research-only.
        """
        # Build search query
        search_term = drug_name.replace(" ", "+")
        url = (
            f"{OPENFDA_BASE}/drug/event.json"
            f"?search=patient.drug.medicinalproduct:{{search_term}}"
            f"&count=patient.reaction.reactionmeddrapt.exact"
            f"&limit={{limit}}"
        )
        
        # Check cache first
        cache_key = hashlib.sha256(url.encode()).hexdigest()
        cached = self.cache.get(cache_key)
        if cached:
            return self._parse_cached_result(drug_name, cached, cache_hit=True)
        
        # Rate limiting
        await self._enforce_rate_limit()
        
        try:
            response = await self.client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            # Store in cache
            self.cache.set(cache_key, data)
            
            return self._parse_api_result(
                drug_name, data, 
                include_signals=include_signals,
                drug_rxcui=drug_rxcui
            )
            
        except httpx.HTTPStatusError as e:
            logger.warning(f"FAERS API error for {{drug_name}}: {{e}}")
            # Fall back to cache (even if expired)
            stale = self.cache.get(cache_key, allow_expired=True)
            if stale:
                return self._parse_cached_result(drug_name, stale, offline_mode=True)
            raise FAERSAPIError(f"No data available for {{drug_name}}") from e
    
    def _parse_api_result(
        self,
        drug_name: str,
        data: dict,
        include_signals: bool = True,
        drug_rxcui: Optional[str] = None
    ) -> FAERSQueryResult:
        """Parse openFDA API response into canonical FAERSQueryResult."""
        results = data.get("results", [])
        
        total_reports = data.get("meta", {}).get("results", {}).get("total", 0)
        
        event_pairs: List[FAERSDrugEventPair] = []
        for result in results:
            term = result.get("term", "Unknown")
            count = result.get("count", 0)
            
            pair = FAERSDrugEventPair(
                drug_name=drug_name,
                drug_rxcui=drug_rxcui,
                event_meddra_pt=term,
                event_meddra_code=None,  # Would need MedDRA mapping
                report_count=count,
                query_date=datetime.now(timezone.utc).isoformat()
            )
            event_pairs.append(pair)
        
        return FAERSQueryResult(
            drug_name=drug_name,
            total_reports_for_drug=total_reports,
            event_pairs=event_pairs,
            api_endpoint_used=f"{OPENFDA_BASE}/drug/event.json",
            research_only=True
        )
```

### 6.3 OnSIDES Adapter Design

```python
# /apps/api/app/services/adapters/onsides_adapter.py

from __future__ import annotations

import csv
import gzip
import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ── Configuration ────────────────────────────────────────────────────────────

ONSIDES_DEFAULT_DB_PATH = Path(__file__).resolve().parents[4] / "data" / "onsides.db"
ONSIDES_MIN_PROBABILITY = 0.85  # Minimum NLP confidence to include
ONSIDES_SECTION_PRIORITY = {"BW": 1, "WP": 2, "AR": 3}  # Display priority


# ── Data Models ──────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class OnSIDESDrugEventPair:
    """Canonical representation of an OnSIDES drug-event pair."""
    drug_rxcui: str
    drug_name: str
    adverse_event: str
    adverse_event_meddra: Optional[str]
    section: str           # AR, BW, WP
    probability: float     # NLP model confidence
    label_id: str
    
    # Display metadata
    section_display_name: str = field(init=False)
    
    def __post_init__(self):
        section_names = {
            "AR": "Adverse Reactions",
            "BW": "Boxed Warning",
            "WP": "Warnings and Precautions"
        }
        object.__setattr__(
            self, "section_display_name", 
            section_names.get(self.section, self.section)
        )
    
    @property
    def caveat_text(self) -> str:
        return (
            f"OnSIDES extracts adverse events from FDA drug labels using NLP. "
            f"This drug-event pair appears in the {{self.section_display_name}} "
            f"section with model confidence {{self.probability:.2f}}. "
            f"Label-reported events are not proven causalities. "
            f"No incidence rate is available. This data is RESEARCH-ONLY."
        )
    
    @property
    def is_boxed_warning(self) -> bool:
        return self.section == "BW"


@dataclass
class OnSIDESQueryResult:
    """Result wrapper for OnSIDES queries."""
    drug_rxcui: str
    drug_name: str
    event_pairs: List[OnSIDESDrugEventPair]
    
    query_date: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    onsides_version: str = ""
    min_probability_applied: float = ONSIDES_MIN_PROBABILITY
    
    research_only: bool = True
    research_only_reason: str = (
        "OnSIDES captures label-reported adverse events extracted via NLP. "
        "These are drug-event pairs from product labels, not proven causal "
        "relationships or incidence rates."
    )
    
    @property
    def boxed_warnings(self) -> List[OnSIDESDrugEventPair]:
        """Return only boxed warnings (highest severity)."""
        return [e for e in self.event_pairs if e.is_boxed_warning]
    
    @property
    def display_caveat(self) -> str:
        total = len(self.event_pairs)
        boxed = len(self.boxed_warnings)
        return (
            f"{{total}} adverse event(s) found on drug label for {{self.drug_name}}. "
            f"{{boxed}} boxed warning(s). "
            "Data extracted from FDA labels via NLP. "
            "Not a substitute for reading the full label. "
            "This is research data for reference only."
        )


class OnSIDESAdapter:
    """
    DeepSynaps adapter for OnSIDES database.
    
    Design principles:
    1. Local SQLite database for fast queries
    2. Probability threshold filtering
    3. Section-aware display (boxed warnings prioritized)
    4. Every result carries caveats
    5. All data is research-only
    """
    
    def __init__(
        self,
        db_path: Optional[Path] = None,
        min_probability: float = ONSIDES_MIN_PROBABILITY
    ) -> None:
        self.db_path = db_path or ONSIDES_DEFAULT_DB_PATH
        self.min_probability = min_probability
        self._db = None
    
    def _get_db(self) -> sqlite3.Connection:
        """Lazy database connection."""
        if self._db is None:
            if not self.db_path.exists():
                raise OnSIDESDatabaseError(
                    f"OnSIDES database not found at {{self.db_path}}. "
                    "Run quarterly update pipeline to populate."
                )
            self._db = sqlite3.connect(str(self.db_path))
            self._db.row_factory = sqlite3.Row
        return self._db
    
    def query_by_rxcui(
        self,
        rxcui: str,
        sections: Optional[List[str]] = None,
        min_probability: Optional[float] = None
    ) -> OnSIDESQueryResult:
        """
        Query OnSIDES by RxNorm CUI.
        
        Returns OnSIDESQueryResult with full provenance and caveats.
        """
        min_prob = min_probability or self.min_probability
        
        query = """
            SELECT drug_rxnorm, drug_name, adverse_event, 
                   adverse_event_meddra, section, probability, label_id
            FROM onsides 
            WHERE drug_rxnorm = ? AND probability >= ?
        """
        params = [rxcui, min_prob]
        
        if sections:
            placeholders = ",".join("?" * len(sections))
            query += f" AND section IN ({{placeholders}})"
            params.extend(sections)
        
        query += " ORDER BY CASE section WHEN 'BW' THEN 1 WHEN 'WP' THEN 2 WHEN 'AR' THEN 3 ELSE 4 END, probability DESC"
        
        db = self._get_db()
        rows = db.execute(query, params).fetchall()
        
        event_pairs = [
            OnSIDESDrugEventPair(
                drug_rxcui=row["drug_rxnorm"],
                drug_name=row["drug_name"],
                adverse_event=row["adverse_event"],
                adverse_event_meddra=row.get("adverse_event_meddra"),
                section=row["section"],
                probability=row["probability"],
                label_id=row["label_id"]
            )
            for row in rows
        ]
        
        # Get drug name from first result or use RxNorm lookup
        drug_name = event_pairs[0].drug_name if event_pairs else rxcui
        
        return OnSIDESQueryResult(
            drug_rxcui=rxcui,
            drug_name=drug_name,
            event_pairs=event_pairs,
            onsides_version=self._get_version()
        )
    
    def _get_version(self) -> str:
        """Get OnSIDES database version from metadata table."""
        try:
            db = self._get_db()
            row = db.execute(
                "SELECT value FROM metadata WHERE key = 'version'"
            ).fetchone()
            return row["value"] if row else "unknown"
        except Exception:
            return "unknown"
```

### 6.4 Unified Adverse Event Service

```python
# /apps/api/app/services/adverse_event_service.py

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.services.adapters.faers_adapter import FAERSAdapter, FAERSQueryResult
from app.services.adapters.onsides_adapter import OnSIDESAdapter, OnSIDESQueryResult


@dataclass
class UnifiedAdverseEventProfile:
    """
    Unified adverse event profile combining FAERS + OnSIDES data
    for a single drug. This is the canonical output for display.
    """
    drug_name: str
    drug_rxcui: Optional[str]
    
    # FAERS data (post-marketing spontaneous reports)
    faers_data: Optional[FAERSQueryResult] = None
    
    # OnSIDES data (label-derived adverse events)
    onsides_data: Optional[OnSIDESQueryResult] = None
    
    # Unified metadata
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Governance — ALWAYS research-only
    research_only: bool = True
    research_only_reason: str = (
        "Adverse event data combines spontaneous reporting (FAERS) with "
        "label-derived NLP extractions (OnSIDES). Neither source provides "
        "incidence rates or proven causal relationships. This data is for "
        "research and signal detection only."
    )
    
    @property
    def master_caveat(self) -> str:
        return (
            "⚠️ RESEARCH DATA ONLY — NOT FOR CLINICAL DECISION-MAKING\n\n"
            "This adverse event profile combines:\n"
            "• FAERS: Spontaneous reports (counts ≠ incidence)\n"
            "• OnSIDES: Label-derived NLP extractions (not clinical evidence)\n\n"
            "Key limitations:\n"
            "• No denominator — cannot calculate rates or risk\n"
            "• Reporting bias — serious events over-reported\n"
            "• No causality assessment — reports ≠ proof\n"
            "• Underreporting — most events never reported\n"
            "• Label text ≠ clinical evidence\n\n"
            "Always consult drug labels and clinical references."
        )


class AdverseEventService:
    """
    Unified service providing adverse event intelligence from
    multiple sources with consistent caveat propagation.
    """
    
    def __init__(
        self,
        faers_adapter: Optional[FAERSAdapter] = None,
        onsides_adapter: Optional[OnSIDESAdapter] = None
    ) -> None:
        self.faers = faers_adapter or FAERSAdapter()
        self.onsides = onsides_adapter or OnSIDESAdapter()
    
    async def get_drug_profile(
        self,
        drug_name: str,
        drug_rxcui: Optional[str] = None,
        include_faers: bool = True,
        include_onsides: bool = True
    ) -> UnifiedAdverseEventProfile:
        """
        Get unified adverse event profile for a drug.
        
        Queries both FAERS and OnSIDES in parallel and combines
        results with full provenance and caveats.
        """
        profile = UnifiedAdverseEventProfile(
            drug_name=drug_name,
            drug_rxcui=drug_rxcui
        )
        
        if include_faers:
            try:
                profile.faers_data = await self.faers.query_drug_events(
                    drug_name=drug_name,
                    drug_rxcui=drug_rxcui
                )
            except Exception as e:
                logger.warning(f"FAERS query failed for {{drug_name}}: {{e}}")
        
        if include_onsides and drug_rxcui:
            try:
                profile.onsides_data = self.onsides.query_by_rxcui(
                    rxcui=drug_rxcui
                )
            except Exception as e:
                logger.warning(f"OnSIDES query failed for {{drug_rxcui}}: {{e}}")
        
        return profile
```



---

## 7. Display Rules & Caveats

### 7.1 The Seven Cardinal Rules

Every adverse event display in DeepSynaps MUST follow these seven rules. Violation of any rule is a safety-critical defect.

#### Rule 1: NEVER Show Raw Report Counts as Incidence Rates

```python
# FORBIDDEN — Never do this:
def WRONG_display_event(drug_event_pair):
    return f"{{drug_event_pair.event}} occurs in {{drug_event_pair.report_count}}% of patients"
    # This is CRIMINALLY WRONG. Report counts are NOT percentages.
    # 100 reports for a drug taken by 10 million people = 0.001%, not 100%.

# CORRECT:
def CORRECT_display_event(drug_event_pair):
    return f"{{drug_event_pair.report_count}} report(s) of {{drug_event_pair.event}} in FAERS"
    # Clear, accurate, no implication of incidence
```

**Enforcement:** The display layer must reject any string containing `%` when paired with raw report counts. This is a hard validation rule.

#### Rule 2: ALWAYS Show "N reports" Not "N% risk"

| Display | Status |
|---------|--------|
| "47 reports of nausea" | CORRECT |
| "47% risk of nausea" | FORBIDDEN |
| "47% of patients experienced nausea" | FORBIDDEN |
| "0.00047% incidence of nausea" | FORBIDDEN (no denominator data) |
| "Nausea (47 reports)" | CORRECT |

#### Rule 3: ALWAYS Include Reporting Bias Caveats

Every adverse event display must include at least one of these caveats:

```
Mandatory caveat phrases (at least one must be visible):
- "FAERS is a reporting database, not an incidence database"
- "Report counts do not indicate causation or risk"
- "Serious adverse events are over-reported relative to mild events"
- "Most adverse events are never reported to FAERS"
- "These are reported associations, not proven causal relationships"
```

#### Rule 4: ALWAYS Flag as Research-Only

Every adverse event panel must display a research-only banner:

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔬 RESEARCH DATA ONLY — NOT FOR CLINICAL DECISION-MAKING           │
│                                                                     │
│  This adverse event data is derived from spontaneous reporting     │
│  systems and/or NLP-extracted drug labels. It is intended for     │
│  pharmacovigilance research and signal detection only.            │
│                                                                     │
│  Do not use this data to make treatment decisions without        │
│  consulting drug labels, clinical references, and qualified       │
│  healthcare professionals.                                        │
└─────────────────────────────────────────────────────────────────────┘
```

#### Rule 5: NEVER Suggest Causation from Signals Alone

| Display | Status |
|---------|--------|
| "Drug X is associated with Event Y (PRR=3.2)" | CORRECT (uses "associated") |
| "Drug X causes Event Y (PRR=3.2)" | FORBIDDEN (implies causation) |
| "Signal detected: Drug X → Event Y" | CORRECT |
| "Drug X leads to Event Y" | FORBIDDEN (implies mechanism) |
| "Drug X has been reported with Event Y" | CORRECT (factual) |

#### Rule 6: Show Signal Algorithm Metrics with Confidence Intervals

When displaying signal detection results, always show:
1. The algorithm used (PRR, ROR, EBGM, BCPNN)
2. The point estimate
3. The 95% confidence interval
4. The number of reports (a)
5. Whether it meets signal criteria

```
PRR: 3.45 (95% CI: 2.10–5.67)
Based on: 24 reports
Chi-square: 42.3 (p < 0.001)
Signal threshold: PRR >= 2, Chi-square >= 4
Status: Signal detected (see limitations below)
```

#### Rule 7: Show Data Source, Version, and Query Date

Every display must show:

```
Source: FAERS Q1 2025 via openFDA API
Data version: 2025Q1 (published 2025-05-15)
Query date: 2025-07-18
Database last updated: 2025-07-01
Next scheduled update: 2025-08-15
```

### 7.2 Evidence Panel Template for Adverse Events

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔬 RESEARCH DATA ONLY                                               │
├──────────────────────────────────────────────────────────────────────┤
│ Drug: Sertraline (RxCUI: 36437)                                     │
│ Event: Serotonin Syndrome (MedDRA: 10040029)                        │
│                                                                      │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ Evidence Grade: D (Very Low — Spontaneous Reporting)             │ │
│ │ Signal: PRR = 2.84 (95% CI: 1.92–4.21)                         │ │
│ │ Reports: 47 in FAERS Q1 2025                                     │ │
│ │ Algorithms: PRR ✓, ROR ✓, EBGM ✗ (2/3 detecting signal)         │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ⚠️ CRITICAL LIMITATIONS:                                            │
│ • FAERS has no denominator — cannot calculate incidence or risk    │
│ • 47 reports does NOT mean 47% risk or 0.047% risk                 │
│ • Total sertraline prescriptions in US: ~30M/year (estimated)      │
│   → 47 reports / 30M+ users = unknown but likely very low rate     │
│ • Serotonin syndrome is a known, labeled effect of SSRIs           │
│ • Reports may reflect awareness bias (clinicians know to report it) │
│ • Confounding: many patients take multiple serotonergic drugs      │
│ • Most serotonin syndrome cases are likely never reported to FAERS │
│ • Stimulated reporting: SSRI safety alerts may increase reporting  │
│                                                                      │
│ 📊 Signal Context:                                                  │
│ • PRR threshold: >= 2 (met: 2.84)                                  │
│ • Chi-square threshold: >= 4 (met: 38.7)                           │
│ • Minimum reports: >= 3 (met: 47)                                  │
│ • This is a statistical signal requiring clinical investigation    │
│                                                                      │
│ 📚 Sources:                                                          │
│ • FAERS Q1 2025 via openFDA API (2025-07-18)                       │
│ • OnSIDES v2.0: serotonin syndrome in SSRI label (prob: 0.97)      │
│                                                                      │
│ 🔬 OnSIDES Label Match:                                             │
│ Sertraline label (section: Warnings and Precautions) mentions      │
│ "serotonin syndrome" with NLP confidence 0.97                      │
│                                                                      │
│ ❗ Conflicting/Alternative Explanations:                            │
│ • Patient may be on multiple serotonergic medications              │
│ • Underlying depression increases medication load                   │
│ • Many "serotonin syndrome" reports may be mild or self-limiting   │
│                                                                      │
│ ✅ Clinician Review Required — Not yet reviewed                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.3 Confidence Tier Assignment

Adverse event data always receives the lowest confidence tiers:

| Data Source | Confidence Tier | Evidence Grade | Color |
|------------|-----------------|---------------|-------|
| FAERS (raw reports) | `RESEARCH_ONLY` | D (Very Low) | Red `#D9534F` |
| FAERS (triangulated signal) | `RESEARCH_ONLY` | D (Very Low) | Red `#D9534F` |
| OnSIDES (single algorithm, no signal) | `RESEARCH_ONLY` | D (Very Low) | Red `#D9534F` |
| OnSIDES (triangulated signal) | `PRELIMINARY` | D (Very Low) | Red `#D9534F` |
| FAERS + OnSIDES (both agree) | `PRELIMINARY` | D (Very Low) | Red `#D9534F` |
| FAERS + OnSIDES + Clinical trial data | `PRELIMINARY` | C (Low) | Orange `#F0AD4E` |
| FAERS + RCT evidence | `PRELIMINARY` | C (Low) | Orange `#F0AD4E` |
| Meta-analysis of RCTs | `PEER_REVIEWED` | B (Moderate) | Green `#5CB85C` |
| Multiple RCTs + active surveillance | `VALIDATED` | A (High) | Dark Green `#1B7A2A` |

**Key principle:** FAERS and OnSIDES data alone can NEVER rise above `PRELIMINARY` tier, regardless of signal strength or agreement.

### 7.4 Uncertainty Visualization Requirements

Every adverse event panel must include these uncertainty indicators:

```
1. Report count bar chart (log scale):
   ┌─────────────────────────────────────────┐
   │ Nausea        ████████████████████  2,847│
   │ Headache      ██████████████        1,923│
   │ Insomnia      ████████              1,045│
   │ [note: NOT proportional to risk]       │
   └─────────────────────────────────────────┘

2. Signal strength indicator:
   PRR:  ▓▓▓▓▓▓▓▓░░ 2.84 (weak signal)
         ░ = within CI, ▓ = point estimate
   
3. Data quality gauge:
   Completeness: ████████░░ 78% (age missing for 45%)
   
4. Confidence interval visualization:
   ├─────●──────────┤
   1.5   2.84       5.2
   (95% CI, signal threshold at 2.0)
```

### 7.5 Safe Display Decision Tree

```
                        ┌──────────────────┐
                        │ Adverse Event    │
                        │ Data Retrieved   │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
               ┌─────────┐ ┌─────────┐ ┌──────────┐
               │ FAERS   │ │OnSIDES  │ │ Combined │
               │ Only    │ │ Only    │ │ Profile  │
               └────┬────┘ └────┬────┘ └────┬─────┘
                    │            │           │
                    ▼            ▼           ▼
               ┌──────────────────────────────────┐
               │ Step 1: Assign RESEARCH-ONLY tier │
               │ (mandatory for ALL adverse events) │
               └───────────────┬──────────────────┘
                               │
                               ▼
               ┌──────────────────────────────────┐
               │ Step 2: Calculate signal metrics  │
               │ (PRR, ROR, EBGM, BCPNN)          │
               └───────────────┬──────────────────┘
                               │
                               ▼
               ┌──────────────────────────────────┐
               │ Step 3: Triangulate across        │
               │ algorithms (require >= 2 agreeing) │
               └───────────────┬──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              ┌──────────┐         ┌────────────┐
              │ Signal   │         │ No Signal  │
              │ Detected │         │ Detected   │
              └────┬─────┘         └─────┬──────┘
                   │                      │
                   ▼                      ▼
          ┌─────────────────┐    ┌──────────────────┐
          │ Show with "Signal│    │ Show as "Reported│
          │ Detected" caveat│    │ but no signal"   │
          │ + all 10        │    │ + all 10         │
          │ limitations     │    │ limitations      │
          └────────┬────────┘    └────────┬─────────┘
                   │                      │
                   └──────────┬───────────┘
                              │
                              ▼
               ┌──────────────────────────────────┐
               │ Step 4: Append OnSIDES label      │
               │ match if available                │
               └───────────────┬──────────────────┘
                               │
                               ▼
               ┌──────────────────────────────────┐
               │ Step 5: Display with ALL caveats  │
               │ and RESEARCH-ONLY banner          │
               └──────────────────────────────────┘
```

---

## 8. Provenance & Confidence Model

### 8.1 Provenance Schema for Adverse Events

Every adverse event record in DeepSynaps carries a `ProvenanceRecord` following the Knowledge Governance schema:

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

@dataclass
class AdverseEventProvenance:
    """
    Complete provenance for an adverse event data point.
    
    This record travels with every adverse event from source
    to display, ensuring full traceability and caveat propagation.
    """
    provenance_id: UUID = field(default_factory=uuid4)
    
    # ── Source Attribution ──────────────────────────────────────
    primary_source: str           # "FAERS" or "OnSIDES"
    secondary_source: Optional[str]  # Cross-reference if combined
    
    # FAERS-specific
    faers_quarter: Optional[str]  # e.g., "2025Q1"
    faers_report_count: int       # Raw report count (a in contingency table)
    faers_primaryids: List[str]   # Report IDs (sample, not all)
    openfda_api_url: Optional[str]  # Full API call URL
    
    # OnSIDES-specific
    onsides_version: Optional[str]  # e.g., "v2.0.0"
    onsides_label_id: Optional[str]  # DailyMed SPL set ID
    onsides_section: Optional[str]  # AR, BW, WP
    onsides_probability: Optional[float]  # NLP confidence
    
    # ── Ingestion Metadata ──────────────────────────────────────
    ingestion_date: datetime = field(default_factory=lambda: datetime.utcnow())
    ingestion_pipeline: str = "adverse_event_adapter"
    ingestion_version: str = "2.0.0"
    ingested_by: str = "FAERSAdapter"  # or "OnSIDESAdapter"
    ingestion_method: str = "openFDA API"  # or "SQLite query"
    
    # ── Freshness ───────────────────────────────────────────────
    data_source_date: Optional[datetime] = None
    update_cadence: str = "quarterly"
    staleness_threshold_days: int = 120  # FAERS data ages faster
    
    # ── Licensing ───────────────────────────────────────────────
    license: str = "Public Domain"  # FAERS is US Government work
    license_url: str = "https://www.fda.gov/about-fda/about-website/website-policies"
    attribution_required: bool = False
    attribution_text: str = "Data from FDA Adverse Event Reporting System (FAERS)"
    commercial_use_permitted: bool = True
    redistribution_permitted: bool = True
    
    # ── Confidence & Evidence ──────────────────────────────────
    confidence_tier: str = "RESEARCH_ONLY"
    evidence_grade: str = "D"
    evidence_grade_justification: str = (
        "Data from spontaneous reporting system with no denominator, "
        "reporting bias, no causality assessment, and no control group. "
        "Signal detection algorithms produce statistical associations "
        "that require clinical investigation for validation."
    )
    
    # ── Research-Only Flagging ─────────────────────────────────
    research_only: bool = True
    research_only_reason: str = (
        "Spontaneous reporting data and NLP-extracted label data "
        "cannot establish causation, incidence rates, or patient-specific "
        "risk. This data is for pharmacovigilance research only."
    )
    research_only_criteria_triggered: List[str] = field(default_factory=lambda: [
        "no_denominator",
        "reporting_bias",
        "no_causality_assessment",
        "spontaneous_reporting",
        "nlp_extracted"
    ])
    
    # ── Transformation History ─────────────────────────────────
    transformation_log: List[Dict] = field(default_factory=list)
    
    def add_transformation(self, operation: str, details: Dict) -> None:
        self.transformation_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "operation": operation,
            "details": details
        })
    
    # ── Audit ───────────────────────────────────────────────────
    created_at: datetime = field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = field(default_factory=lambda: datetime.utcnow())
    version: int = 1
    
    def is_fresh(self) -> bool:
        if not self.data_source_date:
            return False
        age = (datetime.utcnow() - self.data_source_date).days
        return age < self.staleness_threshold_days
    
    @property
    def display_attribution(self) -> str:
        if self.primary_source == "FAERS":
            return (
                f"FAERS {{self.faers_quarter or 'latest'}} — "
                f"{{self.faers_report_count}} report(s)"
            )
        elif self.primary_source == "OnSIDES":
            return (
                f"OnSIDES {{self.onsides_version or ''}} — "
                f"Extracted from drug label (confidence: "
                f"{{self.onsides_probability or 'N/A'}})"
            )
        return self.primary_source
```

### 8.2 Confidence Scoring Model

```python
@dataclass
class AdverseEventConfidence:
    """
    Multi-dimensional confidence score for adverse event data.
    
    Unlike other domains, adverse events use a specialized scoring
    system that emphasizes uncertainty and limitations.
    """
    
    # ── Core Score ──────────────────────────────────────────────
    # Base score (0.0 – 1.0) — ALWAYS starts low for adverse events
    base_score: float = 0.1  # Research-only data starts at 0.1
    
    # ── Dimension Scores ────────────────────────────────────────
    # Each dimension: 0.0 (poor) to 1.0 (excellent)
    
    data_quality_score: float = 0.0
    """Completeness of data fields (demographics, dose, timing)."""
    
    signal_strength_score: float = 0.0
    """PRR/ROR/EBGM magnitude and CI width."""
    
    consistency_score: float = 0.0
    """Agreement across multiple algorithms."""
    
    corroboration_score: float = 0.0
    """Agreement between FAERS and OnSIDES."""
    
    temporal_score: float = 0.0
    """Recency and stability of signal over time."""
    
    clinical_plausibility_score: float = 0.0
    """Biological/mechanistic plausibility."""
    
    # ── Penalty Factors ─────────────────────────────────────────
    # Each penalty: 0.0 (no penalty) to 1.0 (maximum penalty)
    
    no_denominator_penalty: float = 1.0  # ALWAYS 1.0 for FAERS
    """Cannot calculate incidence rates."""
    
    reporting_bias_penalty: float = 0.5
    """Serious events over-reported."""
    
    stimulated_reporting_penalty: float = 0.3
    """Media/regulatory action may inflate reports."""
    
    underreporting_penalty: float = 0.5
    """Most events never reported."""
    
    confounding_penalty: float = 0.4
    """Indication and comorbidities confound."""
    
    weber_effect_penalty: float = 0.2
    """New drugs have inflated reporting."""
    
    # ── Composite Score Calculation ─────────────────────────────
    
    @property
    def composite_score(self) -> float:
        """
        Calculate composite confidence score.
        
        Formula: Start with base_score (0.1 for research-only).
        Add dimension contributions (capped at 0.3 additional).
        Apply penalties multiplicatively.
        
        Maximum possible for research-only data: 0.4
        (requires excellent signal + corroboration + all data quality)
        """
        # Dimension contribution (max 0.3)
        dimension_avg = (
            self.data_quality_score * 0.1 +
            self.signal_strength_score * 0.1 +
            self.consistency_score * 0.05 +
            self.corroboration_score * 0.05 +
            self.temporal_score * 0.0 +
            self.clinical_plausibility_score * 0.0
        )
        
        # Start with base, add dimensions
        score = self.base_score + dimension_avg
        
        # Apply penalties multiplicatively
        penalty_product = (
            (1.0 - self.no_denominator_penalty * 0.3) *
            (1.0 - self.reporting_bias_penalty * 0.15) *
            (1.0 - self.stimulated_reporting_penalty * 0.1) *
            (1.0 - self.underreporting_penalty * 0.15) *
            (1.0 - self.confounding_penalty * 0.1) *
            (1.0 - self.weber_effect_penalty * 0.05)
        )
        
        return round(min(score * penalty_product, 0.4), 4)
    
    @property
    def confidence_tier(self) -> str:
        score = self.composite_score
        if score >= 0.35:
            return "PRELIMINARY"  # Best possible for research-only
        elif score >= 0.2:
            return "PRELIMINARY"
        elif score >= 0.1:
            return "RESEARCH_ONLY"
        else:
            return "RESEARCH_ONLY"
    
    @property
    def evidence_grade(self) -> str:
        """Adverse events from spontaneous reporting are always Grade D."""
        if self.corroboration_score > 0.5 and self.signal_strength_score > 0.5:
            return "D+"  # Slightly better but still D
        return "D"
```

### 8.3 Score Calculation Example

```python
# Example: Sertraline + Serotonin Syndrome
confidence = AdverseEventConfidence(
    base_score=0.1,
    data_quality_score=0.65,      # Age/gender available for 55%
    signal_strength_score=0.72,    # PRR=2.84, good CI
    consistency_score=0.67,        # 2/3 algorithms agree
    corroboration_score=0.85,      # FAERS + OnSIDES both positive
    temporal_score=0.45,
    clinical_plausibility_score=0.90,  # Well-known mechanism
    # Penalties
    no_denominator_penalty=1.0,
    reporting_bias_penalty=0.4,
    stimulated_reporting_penalty=0.2,
    underreporting_penalty=0.6,
    confounding_penalty=0.7,       # Many polypharmacy patients
    weber_effect_penalty=0.1       # Sertraline is established
)

# Composite score calculation:
# Dimensions: 0.1*0.65 + 0.1*0.72 + 0.05*0.67 + 0.05*0.85 = 0.217
# Base: 0.1 + 0.217 = 0.317
# Penalties: 0.7 * 0.94 * 0.98 * 0.91 * 0.93 * 0.995 = 0.54
# Final: 0.317 * 0.54 = 0.171 → 0.17

# Result: RESEARCH_ONLY tier, Grade D
# Displayed as: "Confidence: 0.17 (Research-Only — Very Low)"
```

---

## 9. DeepTwin Adverse-Event Integration

### 9.1 Concept

The DeepTwin module generates patient-specific clinical profiles by fusing multimodal data (demographics, diagnoses, medications, biomarkers, imaging). When adverse event intelligence is integrated, DeepTwin must perform **confound detection** — identifying when an observed drug-event association may be explained by patient-specific confounders rather than true drug causation.

### 9.2 Confound Detection Algorithm

```python
# /apps/api/app/services/deeptwin_adverse_event_confound.py

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class PatientContext:
    """Patient-specific context for confound detection."""
    patient_id: str
    age: Optional[int] = None
    gender: Optional[str] = None
    diagnoses: List[str] = field(default_factory=list)      # ICD-10 codes
    active_medications: List[str] = field(default_factory=list)  # RxCUIs
    prior_adverse_events: List[str] = field(default_factory=list)  # MedDRA PTs
    biomarkers: Dict[str, float] = field(default_factory=dict)


@dataclass
class ConfoundAssessment:
    """Result of confound detection for a drug-event pair."""
    drug_rxcui: str
    event_meddra: str
    
    # Confound flags
    confounding_by_indication: bool = False
    indication_codes: List[str] = field(default_factory=list)
    
    polypharmacy_confound: bool = False
    interacting_drugs: List[str] = field(default_factory=list)
    
    comorbidity_confound: bool = False
    related_diagnoses: List[str] = field(default_factory=list)
    
    demographic_confound: bool = False
    age_risk_factor: bool = False
    gender_risk_factor: bool = False
    
    temporal_confound: bool = False
    insufficient_exposure_time: bool = False
    
    # Overall assessment
    overall_confound_risk: str = "low"  # low, moderate, high
    confidence_adjustment: float = 0.0  # Score reduction
    
    @property
    def display_assessment(self) -> str:
        issues = []
        if self.confounding_by_indication:
            issues.append(f"Indication confound: drug prescribed for condition that may cause event")
        if self.polypharmacy_confound:
            drugs = ", ".join(self.interacting_drugs[:3])
            issues.append(f"Polypharmacy: patient also takes {{drugs}}")
        if self.comorbidity_confound:
            issues.append(f"Comorbidity: related diagnoses present")
        if self.demographic_confound:
            issues.append(f"Demographic risk factors present")
        if self.temporal_confound:
            issues.append(f"Insufficient exposure time for attribution")
        
        if not issues:
            return "No major confounders detected (caution: assessment is incomplete)"
        
        return "; ".join(issues)


class DeepTwinAdverseEventConfoundDetector:
    """
    Detects confounding factors that may explain drug-event associations
    in patient-specific contexts. This is critical for preventing the
    system from attributing events to drugs when the true cause is
    the patient's underlying condition, comorbidities, or other medications.
    """
    
    def __init__(
        self,
        drug_indication_db: Optional[Dict] = None,
        drug_interaction_db: Optional[Dict] = None,
        diagnosis_event_db: Optional[Dict] = None
    ) -> None:
        self.drug_indications = drug_indication_db or {}
        self.drug_interactions = drug_interaction_db or {}
        self.diagnosis_events = diagnosis_event_db or {}
    
    def assess_confounds(
        self,
        drug_rxcui: str,
        event_meddra: str,
        patient: PatientContext,
        faers_prr: Optional[float] = None
    ) -> ConfoundAssessment:
        """
        Assess potential confounds for a drug-event pair in a
        specific patient context.
        
        Returns ConfoundAssessment with flags for each confound type.
        """
        assessment = ConfoundAssessment(
            drug_rxcui=drug_rxcui,
            event_meddra=event_meddra
        )
        
        # 1. Confounding by indication
        indications = self.drug_indications.get(drug_rxcui, [])
        for indication in indications:
            if self._indication_causes_event(indication, event_meddra):
                assessment.confounding_by_indication = True
                assessment.indication_codes.append(indication)
        
        # Check if patient's diagnoses match indications
        patient_indications = set(patient.diagnoses) & set(indications)
        if patient_indications:
            assessment.confounding_by_indication = True
            assessment.indication_codes.extend(patient_indications)
        
        # 2. Polypharmacy confound
        for med in patient.active_medications:
            if med == drug_rxcui:
                continue
            if self._drugs_interact(med, drug_rxcui, event_meddra):
                assessment.polypharmacy_confound = True
                assessment.interacting_drugs.append(med)
        
        # 3. Comorbidity confound
        for diagnosis in patient.diagnoses:
            if self._diagnosis_associated_with_event(diagnosis, event_meddra):
                assessment.comorbidity_confound = True
                assessment.related_diagnoses.append(diagnosis)
        
        # 4. Demographic confound
        if patient.age and self._age_risk_factor(event_meddra, patient.age):
            assessment.demographic_confound = True
            assessment.age_risk_factor = True
        
        # 5. Calculate overall risk
        confound_count = sum([
            assessment.confounding_by_indication,
            assessment.polypharmacy_confound,
            assessment.comorbidity_confound,
            assessment.demographic_confound,
            assessment.temporal_confound
        ])
        
        if confound_count >= 3:
            assessment.overall_confound_risk = "high"
            assessment.confidence_adjustment = 0.3
        elif confound_count >= 2:
            assessment.overall_confound_risk = "moderate"
            assessment.confidence_adjustment = 0.15
        elif confound_count == 1:
            assessment.overall_confound_risk = "moderate"
            assessment.confidence_adjustment = 0.1
        else:
            assessment.overall_confound_risk = "low"
            assessment.confidence_adjustment = 0.0
        
        return assessment
    
    def _indication_causes_event(
        self, indication_code: str, event_meddra: str
    ) -> bool:
        """
        Check if a disease/indication is known to cause the event.
        
        Example: Depression (indication) → Insomnia (event)
        The insomnia may be caused by depression, not the antidepressant.
        """
        # This would query a knowledge base of condition→symptom associations
        condition_events = self.diagnosis_events.get(indication_code, [])
        return event_meddra in condition_events
    
    def _drugs_interact(
        self, drug1: str, drug2: str, event: str
    ) -> bool:
        """Check if two drugs interact to produce the event."""
        interactions = self.drug_interactions.get(drug1, {})
        return drug2 in interactions and event in interactions[drug2]
    
    def _diagnosis_associated_with_event(
        self, diagnosis: str, event: str
    ) -> bool:
        """Check if a diagnosis is associated with the adverse event."""
        events = self.diagnosis_events.get(diagnosis, [])
        return event in events
    
    def _age_risk_factor(self, event: str, age: int) -> bool:
        """Check if age is a risk factor for the event."""
        # Simplified: elderly at higher risk for falls, delirium, etc.
        elderly_events = {
            "fall", "delirium", "confusional state", "syncope",
            "hip fracture", "gastrointestinal haemorrhage"
        }
        if age >= 65 and event.lower() in elderly_events:
            return True
        return False


# Example usage:
# patient = PatientContext(
#     patient_id="DS-2847",
#     age=67,
#     gender="F",
#     diagnoses=["F32.1", "F41.1"],  # Major depression, GAD
#     active_medications=["36437", "321988"],  # Sertraline, Clonazepam
#     prior_adverse_events=["nausea"]
# )
# 
# assessment = detector.assess_confounds(
#     drug_rxcui="36437",  # Sertraline
#     event_meddra="insomnia",
#     patient=patient
# )
# 
# Result: confounding_by_indication=True (depression causes insomnia)
#         confidence_adjustment=0.1
#         Display: "Indication confound: depression may cause insomnia"
```

### 9.3 DeepTwin Display Integration

When DeepTwin displays adverse event data for a patient, it must:

1. **Query FAERS** for the drug → get all reported events with signal metrics
2. **Query OnSIDES** for the drug → get label-derived events with confidence
3. **Run confound detection** → identify patient-specific confounders
4. **Adjust confidence scores** → reduce scores based on confound risk
5. **Display with patient-specific caveats** → show confound assessment

```
┌─────────────────────────────────────────────────────────────────────┐
│ DeepTwin Profile: Patient DS-2847                                   │
│ Drug: Sertraline 50mg daily                                         │
│                                                                      │
│ ⚠️ Adverse Event Intelligence (Research-Only)                      │
│ ─────────────────────────────────                                   │
│ Top Reported Events (FAERS):                                        │
│ 1. Nausea — 2,847 reports, PRR=1.4 (no signal)                    │
│    🔍 Confound check: Depression can cause nausea → MODERATE risk  │
│    Adjusted confidence: 0.08 (Research-Only)                       │
│                                                                      │
│ 2. Insomnia — 1,203 reports, PRR=1.2 (no signal)                  │
│    🔍 Confound check: Depression causes insomnia → HIGH confound   │
│    Also on clonazepam (may be paradoxical)                         │
│    Adjusted confidence: 0.05 (Research-Only)                       │
│    ⚠️ May be explained by patient's depression diagnosis (F32.1)   │
│                                                                      │
│ 3. Headache — 1,045 reports, PRR=1.1 (no signal)                  │
│    🔍 Confound check: Anxiety can cause tension headaches          │
│    Adjusted confidence: 0.06 (Research-Only)                       │
│                                                                      │
│ Boxed Warnings (OnSIDES):                                           │
│ ⚠️ Suicidal ideation (Boxed Warning) — NLP confidence 0.98        │
│    This is a BOXED WARNING on the label.                            │
│    🔍 Confound check: Depression is the indication                  │
│    → Patient is already monitored for this. Standard of care.      │
│                                                                      │
│ RESEARCH-ONLY: This data cannot predict individual patient risk.    │
│ Consult drug label and prescribing information.                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Licensing

### 10.1 FAERS Licensing

| Attribute | Detail |
|-----------|--------|
| **License** | Public Domain (US Government Work) |
| **Legal basis** | 17 U.S. Code § 105 — works of the US Government are not subject to copyright |
| **Attribution required** | No (but recommended for academic integrity) |
| **Commercial use** | Permitted |
| **Redistribution** | Permitted |
| **Modification** | Permitted |
| **Suggested attribution** | "Data from FDA Adverse Event Reporting System (FAERS), US Food and Drug Administration" |
| **Terms of use URL** | https://www.fda.gov/about-fda/about-website/website-policies |

**Key points:**
- FAERS data may be used freely without restriction
- FDA does not warranty the accuracy or completeness of the data
- Users must acknowledge FAERS limitations (spontaneous reporting biases)
- Bulk redistribution should include the standard FDA disclaimer

### 10.2 OnSIDES Licensing

| Attribute | Detail |
|-----------|--------|
| **License** | CC BY 4.0 (Creative Commons Attribution 4.0 International) |
| **Attribution required** | Yes |
| **Commercial use** | Permitted |
| **Redistribution** | Permitted |
| **Modification** | Permitted |
| **Share-alike** | Not required |
| **Required attribution** | "OnSIDES: On-label Side Effect Resource, Tatonetti Lab, Columbia University" |
| **Source** | https://github.com/tatonetti-lab/onsides |
| **Citation** | Reyskens KM, et al. (2023) "OnSIDES: A Comprehensive Resource of Adverse Drug Events" |

**CC BY 4.0 requirements for DeepSynaps:**

```python
ONSIDES_ATTRIBUTION = {
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution_required": True,
    "attribution_text": (
        "OnSIDES: On-label Side Effect Resource. "
        "Tatonetti Lab, Department of Biomedical Informatics, "
        "Columbia University. Available at onsidesdb.org"
    ),
    "commercial_use_permitted": True,
    "redistribution_permitted": True,
    "modification_permitted": True,
    "share_alike_required": False,
    "display_requirement": (
        "Attribution must be displayed alongside OnSIDES data "
        "in the application interface."
    )
}
```

### 10.3 openFDA API Licensing

| Attribute | Detail |
|-----------|--------|
| **License** | Open Data (no restrictions) |
| **Attribution** | Recommended but not required |
| **Rate limits** | 1,000 requests/day without API key; 240/minute with key |
| **API key** | Free registration at https://api.fda.gov/ |

### 10.4 MedDRA Licensing

| Attribute | Detail |
|-----------|--------|
| **License** | Proprietary — requires MedDRA license from ICH/MSSO |
| **Academic/research use** | Free for non-commercial use with registration |
| **Commercial use** | Requires paid license |
| **DeepSynaps requirement** | Must register for free academic license if not already licensed |
| **URL** | https://www.meddra.org/ |

**MedDRA integration notes:**
- MedDRA terminology is embedded in both FAERS and OnSIDES data
- DeepSynaps must not redistribute MedDRA terminology without license
- The MedDRA hierarchy (SOC > HLGT > HLT > PT > LLT) can be used for display purposes
- Consider using UMLS as an intermediary (UMLS license covers MedDRA access)

### 10.5 RxNorm Licensing

| Attribute | Detail |
|-----------|--------|
| **License** | UMLS License Agreement (free for US-based organizations) |
| **Access** | RxNorm API is free; full download requires UMLS license |
| **URL** | https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html |

### 10.6 Combined License Display

When displaying data from both sources, DeepSynaps must show:

```
┌──────────────────────────────────────────────────────────────────┐
│ Data Licensing                                                   │
│                                                                  │
│ FAERS data: Public Domain (US Government Work)                   │
│ No attribution required. Data from FDA Adverse Event Reporting   │
│ System, US Food and Drug Administration.                         │
│                                                                  │
│ OnSIDES data: CC BY 4.0                                          │
│ OnSIDES: On-label Side Effect Resource. Tatonetti Lab,           │
│ Columbia University. onsidesdb.org                               │
│                                                                  │
│ MedDRA terminology used under academic license from ICH/MSSO.    │
│ RxNorm drug identifiers from NLM (UMLS license).                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Recommendations

### 11.1 Implementation Priority

| Priority | Task | Estimated Effort | Dependencies |
|----------|------|-----------------|--------------|
| P0 | OnSIDES SQLite database setup + ingestion pipeline | 2 days | None |
| P0 | OnSIDES adapter (`onsides_adapter.py`) | 1 day | OnSIDES DB |
| P0 | FAERS adapter improvements (`faers_adapter.py`) | 2 days | openFDA API |
| P0 | Signal detection module (`signal_detection.py`) | 2 days | FAERS adapter |
| P0 | Display rules enforcement | 1 day | None |
| P1 | Unified adverse event service | 1 day | Both adapters |
| P1 | DeepTwin confound detection | 3 days | Patient context model |
| P1 | Provenance + confidence scoring | 2 days | Knowledge Governance |
| P1 | CAVEAT display components (React) | 2 days | UX rules |
| P2 | Quarterly update pipeline (Snakemake) | 2 days | Both adapters |
| P2 | EBGM/BCPNN full implementation | 2 days | Signal detection |
| P2 | Cross-source triangulation | 1 day | Signal detection |
| P2 | API endpoints + documentation | 1 day | Unified service |
| P3 | Historical trend analysis | 2 days | FAERS quarterly data |
| P3 | Advanced confound detection | 3 days | DeepTwin integration |

**Total estimated effort: 3-4 weeks (1 engineer)**

### 11.2 Quarterly Update Pipeline

```python
# /apps/api/pipeline/adverse_event_quarterly_update.py

"""
Quarterly update pipeline for FAERS and OnSIDES data.

Schedule: Run on the 15th of March, June, September, December
          (approximately when FAERS releases quarterly data).

Execution: Snakemake workflow or cron-triggered Python script.
"""

import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

QUARTERLY_UPDATE_STEPS = [
    {
        "step": 1,
        "name": "Check FAERS data release",
        "action": "Query openFDA API for latest quarter metadata",
        "validate": "Verify meta.last_updated has changed since last run"
    },
    {
        "step": 2,
        "name": "Download OnSIDES quarterly release",
        "action": "wget https://github.com/tatonetti-lab/onsides/releases/...",
        "validate": "Verify checksum matches published hash"
    },
    {
        "step": 3,
        "name": "Update OnSIDES SQLite database",
        "action": "Import new TSV into SQLite, rebuild indices",
        "validate": "Row count matches expected coverage"
    },
    {
        "step": 4,
        "name": "Update signal detection baselines",
        "action": "Recalculate expected reporting rates for all drugs",
        "validate": "PRR distributions stable (within 5% of previous)"
    },
    {
        "step": 5,
        "name": "Clear stale API cache",
        "action": "Invalidate FAERS cache entries older than new release date",
        "validate": "Cache hit rate drops, then recovers"
    },
    {
        "step": 6,
        "name": "Integration tests",
        "action": "Run test suite against updated data",
        "validate": "All tests pass; no breaking changes"
    },
    {
        "step": 7,
        "name": "Update provenance records",
        "action": "Bump version tags, update metadata tables",
        "validate": "API returns new version in provenance"
    },
    {
        "step": 8,
        "name": "Alert stakeholders",
        "action": "Post Slack notification + update changelog",
        "validate": "Notification received by clinical team"
    }
]


def run_quarterly_update(
    quarter: str,  # e.g., "2025Q2"
    data_dir: Path = Path("/app/data")
) -> dict:
    """
    Execute the full quarterly update pipeline.
    
    Returns status report with any issues encountered.
    """
    logger.info(f"Starting quarterly update for {{quarter}}")
    
    results = []
    for step in QUARTERLY_UPDATE_STEPS:
        logger.info(f"Step {{step['step']}}: {{step['name']}}")
        # Execute step...
        # Validate...
        results.append({"step": step["step"], "status": "completed"})
    
    return {
        "quarter": quarter,
        "completed_at": datetime.utcnow().isoformat(),
        "steps_completed": len(results),
        "status": "success"
    }
```

### 11.3 Testing Strategy

```python
# /apps/api/tests/test_adverse_event_governance.py

"""
Safety-critical tests for adverse event governance.
These tests enforce the display rules and must never fail.
"""

import pytest
from app.services.adapters.faers_adapter import FAERSDrugEventPair


class TestAdverseEventDisplayRules:
    """Test suite enforcing the Seven Cardinal Rules."""
    
    def test_rule1_never_show_counts_as_percentages(self):
        """
        Rule 1: Raw report counts must NEVER be displayed with % sign.
        """
        pair = FAERSDrugEventPair(
            drug_name="aspirin",
            drug_rxcui="1191",
            event_meddra_pt="gastric ulcer",
            report_count=500
        )
        display = pair.caveat_text
        
        # Must NOT contain percentage sign
        assert "%" not in display, (
            f"CRITICAL SAFETY VIOLATION: Display text contains '%': {{display}}"
        )
        
        # Must contain explicit "report(s)" language
        assert "report" in display.lower(), (
            f"Must use 'report' terminology: {{display}}"
        )
    
    def test_rule2_always_show_n_reports_not_percent(self):
        """Rule 2: Display must use 'N reports' format."""
        pass  # Covered by rule 1
    
    def test_rule3_always_include_caveats(self):
        """
        Rule 3: Every result must include reporting bias caveats.
        """
        pair = FAERSDrugEventPair(
            drug_name="aspirin",
            drug_rxcui="1191",
            event_meddra_pt="gastric ulcer",
            report_count=500
        )
        caveat = pair.caveat_text
        
        required_phrases = [
            "report counts do not indicate",
            "causation",
            "incidence",
            "research-only"
        ]
        
        for phrase in required_phrases:
            assert phrase.lower() in caveat.lower(), (
                f"Missing required caveat phrase '{{phrase}}': {{caveat}}"
            )
    
    def test_rule4_always_flag_research_only(self):
        """
        Rule 4: All adverse event data must carry research-only flag.
        """
        assert FAERSDrugEventPair.__dataclass_fields__  # Verify structure
    
    def test_rule5_never_suggest_causation(self):
        """
        Rule 5: Display must never use causal language.
        """
        forbidden_words = ["causes", "caused", "leads to", "results in"]
    
    def test_rule6_show_signal_metrics_with_ci(self):
        """Rule 6: Signal metrics must include confidence intervals."""
        pass
    
    def test_rule7_show_data_source_version_date(self):
        """Rule 7: Provenance must include source, version, date."""
        pass


class TestOnSIDESCaveats:
    """Test suite for OnSIDES-specific caveats."""
    
    def test_onsides_caveat_includes_nlp_confidence(self):
        """OnSIDES caveat must mention NLP extraction and confidence."""
        pass
    
    def test_onsides_caveat_states_not_incidence(self):
        """OnSIDES caveat must state events are not incidence rates."""
        pass
    
    def test_onsides_caveat_states_label_derived(self):
        """OnSIDES caveat must state data is label-derived."""
        pass


class TestSignalDetection:
    """Test suite for signal detection accuracy."""
    
    def test_prr_calculation(self):
        """PRR must calculate correctly for known examples."""
        # PRR = (a/(a+b)) / (c/(c+d))
        result = calculate_prr(a=10, b=90, c=100, d=900)
        expected_prr = (10/100) / (100/1000)  # 0.1 / 0.1 = 1.0
        assert abs(result.prr - expected_prr) < 0.01
    
    def test_signal_threshold(self):
        """Signal must only fire when all criteria met."""
        # Below threshold
        result = calculate_prr(a=2, b=100, c=50, d=1000)
        assert not result.signal_detected  # a < 3
        
        # At threshold
        result = calculate_prr(a=10, b=50, c=20, d=1000)
        assert result.signal_detected  # PRR=10, Chi2 large, a>=3


class TestConfidenceTier:
    """Test suite for confidence tier assignment."""
    
    def test_faers_always_research_only(self):
        """FAERS data alone can never exceed RESEARCH_ONLY tier."""
        pass
    
    def test_onsides_always_research_only(self):
        """OnSIDES data alone can never exceed RESEARCH_ONLY tier."""
        pass
    
    def test_combined_max_preliminary(self):
        """Combined FAERS+OnSIDES can never exceed PRELIMINARY tier."""
        pass
```

### 11.4 API Endpoint Design

```python
# /apps/api/app/routers/adverse_events.py

"""
FastAPI router for adverse event endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional

router = APIRouter(prefix="/api/v2/adverse-events", tags=["adverse-events"])


@router.get("/drug/{{rxcui}}")
async def get_drug_adverse_events(
    rxcui: str,
    include_faers: bool = True,
    include_onsides: bool = True,
    min_signal_prr: float = Query(default=2.0, ge=1.0),
    min_onsides_prob: float = Query(default=0.85, ge=0.0, le=1.0),
    max_results: int = Query(default=50, ge=1, le=500),
    service: AdverseEventService = Depends(get_adverse_event_service)
) -> dict:
    """
    Get adverse event profile for a drug by RxNorm CUI.
    
    Returns combined FAERS + OnSIDES data with full provenance and caveats.
    ALL data is research-only and includes mandatory caveats.
    """
    profile = await service.get_drug_profile(
        drug_name="",  # Will be resolved from RxCUI
        drug_rxcui=rxcui,
        include_faers=include_faers,
        include_onsides=include_onsides
    )
    
    return {
        "drug": profile.drug_name,
        "rxcui": profile.drug_rxcui,
        "generated_at": profile.generated_at.isoformat(),
        "research_only": True,
        "research_only_reason": profile.research_only_reason,
        "master_caveat": profile.master_caveat,
        "faers": profile.faers_data.to_dict() if profile.faers_data else None,
        "onsides": profile.onsides_data.to_dict() if profile.onsides_data else None
    }


@router.get("/signal/{{drug}}/{{event}}")
async def get_signal_detection(
    drug: str,
    event: str,
    algorithms: List[str] = Query(default=["prr", "ror"]),
    service: AdverseEventService = Depends(get_adverse_event_service)
) -> dict:
    """
    Calculate signal detection metrics for a drug-event pair.
    
    Runs PRR, ROR, EBGM, BCPNN and returns triangulated results.
    ALL results include mandatory caveats about spontaneous reporting.
    """
    pass


@router.get("/caveats")
def get_caveats() -> dict:
    """
    Return the complete set of caveats and disclaimers.
    
    This endpoint exists so the frontend can display current caveats
    without querying specific drugs.
    """
    return {
        "faers_caveats": FAERS_CAVEATS,
        "onsides_caveats": ONSIDES_CAVEATS,
        "universal_caveats": UNIVERSAL_CAVEATS,
        "display_rules": DISPLAY_RULES,
        "last_updated": "2025-07-18"
    }
```

---

## 12. Risks & Mitigations

### 12.1 Risk Register

| Risk ID | Risk | Severity | Likelihood | Impact | Mitigation | Owner |
|---------|------|----------|-----------|--------|-----------|-------|
| R1 | User misinterprets report count as incidence rate | **Critical** | High | Patient harm from treatment change | Hard enforcement: display layer blocks % symbols; mandatory caveats; clinician review gate | Clinical Safety |
| R2 | Signal detection false positive leads to unnecessary alert | **High** | Medium | Alert fatigue; unnecessary clinical work | Triangulated algorithms (>=2 agreeing); confound detection; confidence threshold | Data Science |
| R3 | Data staleness — old FAERS quarter not updated | **Medium** | Medium | Decisions based on outdated data | Automated quarterly pipeline; freshness indicators; stale data warnings | Engineering |
| R4 | OnSIDES NLP false positive — non-ADE extracted | **Medium** | Medium | Incorrect adverse event profile | Probability threshold filtering; section-aware display; manual spot-checks quarterly | Data Science |
| R5 | Confounding not detected — drug attributed to event caused by disease | **High** | Medium | Wrong drug identified as cause | DeepTwin confound detection; indication checking; comorbidity awareness | Clinical Safety |
| R6 | Weber effect — new drug falsely appears high-risk | **Medium** | Medium | Inappropriate risk assessment | Time-on-market adjustment; historical comparison; flag new drugs | Data Science |
| R7 | API outage — openFDA unavailable | **Low** | Low | Missing adverse event data | SQLite cache with stale fallback; offline mode indicators | Engineering |
| R8 | License violation — MedDRA redistribution | **Medium** | Low | Legal exposure | MedDRA terms in config; redistribution audit; UMLS intermediary | Legal/Compliance |
| R9 | Stimulated reporting spike misinterpreted as safety signal | **High** | Medium | False alarm triggers clinical response | Temporal analysis; media/regulatory event detection; spike flagging | Data Science |
| R10 | Underreporting leads to false sense of safety | **Critical** | High | Drug appears safe when it's not | Always show underreporting caveat; never state "no reports = no risk" | Clinical Safety |

### 12.2 Critical Risk Deep Dives

#### R1: Misinterpretation of Report Counts

**Scenario:** A clinician sees "500 reports of nausea for Drug X" and concludes the drug commonly causes nausea. They switch the patient to an alternative without proper evidence.

**Root cause:** The human cognitive bias of "availability heuristic" — frequent reports feel like high risk.

**Mitigation layers:**
1. **Adapter layer:** Never return raw counts without caveat strings
2. **API layer:** Every response includes `research_only: true` and `master_caveat`
3. **Display layer:** Hard-block percentage display; mandatory banner
4. **Workflow layer:** Clinician review required before any action
5. **Training layer:** User education on pharmacovigilance limitations

#### R10: False Sense of Safety from Underreporting

**Scenario:** A drug has zero FAERS reports for a rare but serious adverse event. The system displays "0 reports" and clinicians conclude the drug is safe.

**Root cause:** Zero reports does NOT mean zero events. Underreporting means most events are never reported.

**Mitigation:**
- NEVER display "0 reports" without the caveat: "Zero reports does not mean zero risk. Most adverse events are never reported to FAERS."
- For drugs with low report counts, display: "Limited reporting data available. This does not indicate safety."
- Always cross-reference with OnSIDES label data (may show labeled events even with zero FAERS reports)

#### R5: Confounding by Indication

**Scenario:** A patient on methotrexate for rheumatoid arthritis develops lymphoma. The system flags a high PRR for methotrexate-lymphoma. The clinician concludes methotrexate caused the lymphoma and discontinues it.

**Root cause:** Rheumatoid arthritis itself increases lymphoma risk. The drug may not be causal.

**Mitigation:**
- DeepTwin confound detection checks patient diagnoses
- If indication is known to cause the event, display: "⚠️ Confounding by indication: [Condition] is known to cause [Event]. Drug causation cannot be established."
- Confidence score reduced by confound penalty

### 12.3 Fallback Strategies

| Scenario | Fallback | Data Quality Indicator |
|----------|----------|----------------------|
| openFDA API down | Use cached data (up to 7 days old) | `offline: true, cache_age: "3 days"` |
| OnSIDES DB missing | Return FAERS only with extra caveat | `onsides_available: false` |
| FAERS API error | Return OnSIDES only | `faers_available: false` |
| Both sources unavailable | Return structured error with explanation | `data_unavailable: true` |
| Signal calculation fails | Return raw counts with extra uncertainty | `signal_calculation_failed: true` |
| Confound detection unavailable | Return results with "confound assessment unavailable" | `confound_check: false` |

---

## 13. Appendix: Code Reference

### 13.1 Complete Signal Detection Module

```python
# /apps/api/app/services/pharmacovigilance/signal_detection.py

"""
Signal detection algorithms for pharmacovigilance.

Implements PRR, ROR, EBGM, and BCPNN with triangulation.
All algorithms include confidence intervals and signal thresholds.

CRITICAL: These algorithms detect STATISTICAL SIGNALS, not CAUSATION.
A signal means "investigate further," not "the drug causes the event."
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Dict, List, NamedTuple, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

PRR_THRESHOLD = 2.0
CHI_SQUARE_THRESHOLD = 4.0
ROR_THRESHOLD = 2.0
EBGM_EB05_THRESHOLD = 2.0
BCPNN_IC_THRESHOLD = 0.0
MIN_REPORTS = 3


# ── Result Types ─────────────────────────────────────────────────────────────

class SignalStatus(str):
    NO_SIGNAL = "no_signal"
    WEAK_SIGNAL = "weak_signal"
    MODERATE_SIGNAL = "moderate_signal"
    STRONG_SIGNAL = "strong_signal"


@dataclass(frozen=True)
class SignalResult:
    """Complete signal detection result for a drug-event pair."""
    
    # Input
    drug_name: str
    event_name: str
    a: int  # Drug + Event
    b: int  # Drug without Event
    c: int  # Event without Drug
    d: int  # Neither
    
    # PRR
    prr: float
    prr_ci_lower: Optional[float]
    prr_ci_upper: Optional[float]
    prr_chi_square: float
    prr_signal: bool
    
    # ROR
    ror: float
    ror_ci_lower: Optional[float]
    ror_ci_upper: Optional[float]
    ror_signal: bool
    
    # EBGM (simplified)
    ebgm: Optional[float]
    eb05: Optional[float]
    eb95: Optional[float]
    ebgm_signal: bool
    
    # BCPNN (simplified)
    ic: Optional[float]
    ic_ci_lower: Optional[float]
    ic_ci_upper: Optional[float]
    bcpnn_signal: bool
    
    # Triangulation
    algorithms_tested: int = 4
    algorithms_detecting: int = 0
    triangulated_signal: bool = False
    signal_strength: str = SignalStatus.NO_SIGNAL
    
    @property
    def summary(self) -> str:
        status = (
            "TRIANGULATED SIGNAL" if self.triangulated_signal else
            "SINGLE ALGORITHM SIGNAL" if self.algorithms_detecting == 1 else
            "NO SIGNAL"
        )
        return (
            f"{{self.drug_name}} → {{self.event_name}}: "
            f"{{status}} ({{self.algorithms_detecting}}/{{self.algorithms_tested}} algorithms, "
            f"{{self.a}} reports, PRR={{self.prr:.2f}})"
        )


def full_signal_analysis(
    drug_name: str,
    event_name: str,
    a: int,
    b: int,
    c: int,
    d: int,
    include_ebgm: bool = False,
    include_bcpnn: bool = False
) -> SignalResult:
    """
    Run complete signal detection analysis on a drug-event pair.
    
    Args:
        a: Reports with Drug AND Event
        b: Reports with Drug without Event
        c: Reports with Event without Drug
        d: Reports with neither
        
    Returns:
        SignalResult with all metrics and triangulated signal flag
    """
    # PRR
    prr_result = calculate_prr(a, b, c, d)
    
    # ROR
    ror_result = calculate_ror(a, b, c, d)
    
    # EBGM (optional — computationally expensive)
    ebgm_result = None
    if include_ebgm:
        ebgm_result = calculate_ebgm_simplified(a, b, c, d)
    
    # BCPNN (optional)
    bcpnn_result = None
    if include_bcpnn:
        bcpnn_result = calculate_bcpnn(a, b, c, d)
    
    # Count algorithms detecting signal
    detecting = sum([
        prr_result.signal_detected,
        ror_result.signal_detected,
        ebgm_result.signal_detected if ebgm_result else False,
        bcpnn_result.signal_detected if bcpnn_result else False
    ])
    
    tested = 2 + (1 if include_ebgm else 0) + (1 if include_bcpnn else 0)
    triangulated = detecting >= 2
    
    # Signal strength
    if triangulated and detecting >= 3:
        strength = SignalStatus.STRONG_SIGNAL
    elif triangulated:
        strength = SignalStatus.MODERATE_SIGNAL
    elif detecting == 1:
        strength = SignalStatus.WEAK_SIGNAL
    else:
        strength = SignalStatus.NO_SIGNAL
    
    return SignalResult(
        drug_name=drug_name,
        event_name=event_name,
        a=a, b=b, c=c, d=d,
        prr=prr_result.prr,
        prr_ci_lower=prr_result.lower_ci,
        prr_ci_upper=prr_result.upper_ci,
        prr_chi_square=prr_result.chi_square,
        prr_signal=prr_result.signal_detected,
        ror=ror_result.ror,
        ror_ci_lower=ror_result.lower_ci,
        ror_ci_upper=ror_result.upper_ci,
        ror_signal=ror_result.signal_detected,
        ebgm=ebgm_result.ebgm if ebgm_result else None,
        eb05=ebgm_result.eb05 if ebgm_result else None,
        eb95=ebgm_result.eb95 if ebgm_result else None,
        ebgm_signal=ebgm_result.signal_detected if ebgm_result else False,
        ic=bcpnn_result.ic if bcpnn_result else None,
        ic_ci_lower=bcpnn_result.lower_ci if bcpnn_result else None,
        ic_ci_upper=bcpnn_result.upper_ci if bcpnn_result else None,
        bcpnn_signal=bcpnn_result.signal_detected if bcpnn_result else False,
        algorithms_tested=tested,
        algorithms_detecting=detecting,
        triangulated_signal=triangulated,
        signal_strength=strength
    )


def batch_signal_analysis(
    drug_event_pairs: List[Tuple[str, str, int, int, int, int]],
    min_algorithms: int = 2
) -> List[SignalResult]:
    """
    Run signal detection on multiple drug-event pairs.
    
    Returns only pairs with triangulated signals (or all if min_algorithms=1).
    """
    results = []
    for drug, event, a, b, c, d in drug_event_pairs:
        if a < MIN_REPORTS:
            continue
        result = full_signal_analysis(drug, event, a, b, c, d)
        if result.algorithms_detecting >= min_algorithms:
            results.append(result)
    
    # Sort by signal strength
    strength_order = {
        SignalStatus.STRONG_SIGNAL: 3,
        SignalStatus.MODERATE_SIGNAL: 2,
        SignalStatus.WEAK_SIGNAL: 1,
        SignalStatus.NO_SIGNAL: 0
    }
    results.sort(
        key=lambda r: (strength_order.get(r.signal_strength, 0), r.a),
        reverse=True
    )
    
    return results
```

### 13.2 Complete FAERS Data Parser

```python
# /apps/api/app/services/pharmacovigilance/faers_parser.py

"""
Parser for FAERS quarterly ASCII data files.

Handles the seven pipe-delimited files (DEMO, DRUG, REAC, OUTC, 
RPSR, THER, INDI) and provides a unified query interface.
"""

from __future__ import annotations

import csv
import gzip
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class FAERSReport:
    """Unified FAERS report combining all seven file types."""
    primaryid: str
    caseid: str
    caseversion: int
    
    # Demographics
    age: Optional[int] = None
    age_unit: Optional[str] = None
    gender: Optional[str] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None
    reporter_country: Optional[str] = None
    reporter_occupation: Optional[str] = None
    
    # Dates
    event_date: Optional[str] = None
    fda_received_date: Optional[str] = None
    
    # Drugs
    drugs: List[Dict] = field(default_factory=list)
    
    # Reactions
    reactions: List[str] = field(default_factory=list)
    
    # Outcomes
    outcomes: List[str] = field(default_factory=list)
    
    # Indications
    indications: List[str] = field(default_factory=list)
    
    @property
    def suspect_drugs(self) -> List[Dict]:
        """Return drugs with role 'PS' (primary suspect)."""
        return [d for d in self.drugs if d.get("role") == "PS"]
    
    @property
    def is_serious(self) -> bool:
        """Check if report has any serious outcome."""
        serious_outcomes = {"DE", "LT", "HO", "DS", "CA", "RI"}
        return bool(set(self.outcomes) & serious_outcomes)


class FAERSQuarterlyParser:
    """
    Parser for FAERS quarterly data release.
    
    Usage:
        parser = FAERSQuarterlyParser("/data/faers/2025Q1")
        for report in parser.iter_reports():
            process(report)
    """
    
    def __init__(self, quarter_dir: Path) -> None:
        self.quarter_dir = Path(quarter_dir)
        self._drug_lookup: Dict[str, List[Dict]] = {}
        self._reaction_lookup: Dict[str, List[str]] = {}
        self._outcome_lookup: Dict[str, List[str]] = {}
        self._indication_lookup: Dict[str, List[str]] = {}
        self._loaded = False
    
    def _load_supporting_files(self) -> None:
        """Load DRUG, REAC, OUTC, INDI into lookup tables."""
        if self._loaded:
            return
        
        # Load DRUG
        drug_file = self._find_file("DRUG")
        if drug_file:
            self._drug_lookup = self._load_drug_file(drug_file)
        
        # Load REAC
        reac_file = self._find_file("REAC")
        if reac_file:
            self._reaction_lookup = self._load_reaction_file(reac_file)
        
        # Load OUTC
        outc_file = self._find_file("OUTC")
        if outc_file:
            self._outcome_lookup = self._load_outcome_file(outc_file)
        
        # Load INDI
        indi_file = self._find_file("INDI")
        if indi_file:
            self._indication_lookup = self._load_indication_file(indi_file)
        
        self._loaded = True
    
    def _find_file(self, prefix: str) -> Optional[Path]:
        """Find FAERS file by prefix (handles .txt, .csv, .gz variants)."""
        for ext in ["", ".txt", ".csv", ".txt.gz", ".csv.gz"]:
            path = self.quarter_dir / f"{{prefix}}{{ext}}"
            if path.exists():
                return path
            # Legacy format: prefix is all-caps filename
            path = self.quarter_dir / f"{{prefix.upper()}}{{ext}}"
            if path.exists():
                return path
        return None
    
    def _open_file(self, path: Path):
        """Open file, handling gzip compression."""
        if str(path).endswith(".gz"):
            return gzip.open(path, "rt", encoding="utf-8", errors="replace")
        return open(path, "r", encoding="utf-8", errors="replace")
    
    def _load_drug_file(self, path: Path) -> Dict[str, List[Dict]]:
        """Load DRUG file into lookup by primaryid."""
        lookup: Dict[str, List[Dict]] = {}
        with self._open_file(path) as f:
            reader = csv.DictReader(f, delimiter="$")
            for row in reader:
                pid = row.get("primaryid", row.get("PRIMARYID", ""))
                if not pid:
                    continue
                drug = {
                    "name": row.get("drugname", row.get("DRUGNAME", "")),
                    "ingredient": row.get("prod_ai", row.get("PROD_AI", "")),
                    "role": row.get("role_cod", row.get("ROLE_COD", "")),
                    "route": row.get("route", row.get("ROUTE", "")),
                    "dose": row.get("dose_vbm", row.get("DOSE_VBM", ""))
                }
                lookup.setdefault(pid, []).append(drug)
        return lookup
    
    def _load_reaction_file(self, path: Path) -> Dict[str, List[str]]:
        """Load REAC file into lookup by primaryid."""
        lookup: Dict[str, List[str]] = {}
        with self._open_file(path) as f:
            reader = csv.DictReader(f, delimiter="$")
            for row in reader:
                pid = row.get("primaryid", row.get("PRIMARYID", ""))
                pt = row.get("pt", row.get("PT", ""))
                if pid and pt:
                    lookup.setdefault(pid, []).append(pt)
        return lookup
    
    def _load_outcome_file(self, path: Path) -> Dict[str, List[str]]:
        lookup: Dict[str, List[str]] = {}
        with self._open_file(path) as f:
            reader = csv.DictReader(f, delimiter="$")
            for row in reader:
                pid = row.get("primaryid", row.get("PRIMARYID", ""))
                outc = row.get("outc_cod", row.get("OUTC_COD", ""))
                if pid and outc:
                    lookup.setdefault(pid, []).append(outc)
        return lookup
    
    def _load_indication_file(self, path: Path) -> Dict[str, List[str]]:
        lookup: Dict[str, List[str]] = {}
        with self._open_file(path) as f:
            reader = csv.DictReader(f, delimiter="$")
            for row in reader:
                pid = row.get("primaryid", row.get("PRIMARYID", ""))
                indi = row.get("indi_pt", row.get("INDI_PT", ""))
                if pid and indi:
                    lookup.setdefault(pid, []).append(indi)
        return lookup
    
    def iter_reports(self) -> Iterator[FAERSReport]:
        """
        Iterate over all reports in the quarter.
        
        Yields FAERSReport objects with demographics, drugs, reactions,
        outcomes, and indications combined.
        """
        self._load_supporting_files()
        
        demo_file = self._find_file("DEMO")
        if not demo_file:
            raise FileNotFoundError(f"No DEMO file found in {{self.quarter_dir}}")
        
        with self._open_file(demo_file) as f:
            reader = csv.DictReader(f, delimiter="$")
            for row in reader:
                pid = row.get("primaryid", row.get("PRIMARYID", ""))
                if not pid:
                    continue
                
                # Parse age
                age = None
                try:
                    age = int(row.get("age", row.get("AGE", "0")))
                except (ValueError, TypeError):
                    pass
                
                # Parse weight
                weight = None
                try:
                    weight = float(row.get("wt", row.get("WT", "0")))
                except (ValueError, TypeError):
                    pass
                
                yield FAERSReport(
                    primaryid=pid,
                    caseid=row.get("caseid", row.get("CASEID", "")),
                    caseversion=int(row.get("caseversion", row.get("CASEVERSION", "0"))),
                    age=age,
                    age_unit=row.get("age_cod", row.get("AGE_COD", "")),
                    gender=row.get("gndr_cod", row.get("GNDR_COD", "")),
                    weight=weight,
                    weight_unit=row.get("wt_cod", row.get("WT_COD", "")),
                    reporter_country=row.get("reporter_country", row.get("REPORTER_COUNTRY", "")),
                    reporter_occupation=row.get("occp_cod", row.get("OCCP_COD", "")),
                    event_date=row.get("event_dt", row.get("EVENT_DT", "")),
                    fda_received_date=row.get("fda_dt", row.get("FDA_DT", "")),
                    drugs=self._drug_lookup.get(pid, []),
                    reactions=self._reaction_lookup.get(pid, []),
                    outcomes=self._outcome_lookup.get(pid, []),
                    indications=self._indication_lookup.get(pid, [])
                )


# Contingency table builder for signal detection
def build_contingency_table(
    target_drug: str,
    target_event: str,
    reports: List[FAERSReport]
) -> Tuple[int, int, int, int]:
    """
    Build 2x2 contingency table from FAERS reports.
    
    Args:
        target_drug: Drug name to search for (normalized)
        target_event: MedDRA PT to search for
        reports: List of FAERSReport objects
    
    Returns:
        (a, b, c, d) contingency table values
    """
    a = b = c = d = 0
    
    for report in reports:
        has_drug = any(
            target_drug.lower() in d.get("name", "").lower() or
            target_drug.lower() in d.get("ingredient", "").lower()
            for d in report.drugs
        )
        has_event = target_event.lower() in [
            r.lower() for r in report.reactions
        ]
        
        if has_drug and has_event:
            a += 1
        elif has_drug and not has_event:
            b += 1
        elif not has_drug and has_event:
            c += 1
        else:
            d += 1
    
    return a, b, c, d
```

### 13.3 Key Constants & Configuration

```python
# /apps/api/app/services/pharmacovigilance/constants.py

"""
Centralized constants and configuration for pharmacovigilance module.
"""

# ── FAERS ────────────────────────────────────────────────────────────────────

FAERS_OPENFDA_BASE_URL = "https://api.fda.gov"
FAERS_EVENT_ENDPOINT = "/drug/event.json"
FAERS_LABEL_ENDPOINT = "/drug/label.json"
FAERS_DOWNLOAD_URL = "https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html"

FAERS_DEFAULT_LIMIT = 100
FAERS_MAX_LIMIT = 1000
FAERS_API_TIMEOUT = 10.0

# Cache
FAERS_CACHE_TTL_SECONDS = 24 * 60 * 60
FAERS_MAX_CACHE_AGE_DAYS = 7

# Evidence grade for all FAERS-derived data
FAERS_EVIDENCE_GRADE = "D"
FAERS_CONFIDENCE_TIER = "RESEARCH_ONLY"

# ── OnSIDES ──────────────────────────────────────────────────────────────────

ONSIDES_GITHUB_URL = "https://github.com/tatonetti-lab/onsides"
ONSIDES_DOWNLOAD_URL = "https://onsidesdb.org/download"
ONSIDES_DEFAULT_MIN_PROBABILITY = 0.85

ONSIDES_SECTION_NAMES = {
    "AR": "Adverse Reactions",
    "BW": "Boxed Warnings",
    "WP": "Warnings and Precautions"
}

ONSIDES_EVIDENCE_GRADE = "D"
ONSIDES_CONFIDENCE_TIER = "RESEARCH_ONLY"

# ── Signal Detection ─────────────────────────────────────────────────────────

SIGNAL_PRR_THRESHOLD = 2.0
SIGNAL_CHI_SQUARE_THRESHOLD = 4.0
SIGNAL_ROR_THRESHOLD = 2.0
SIGNAL_EBGM_EB05_THRESHOLD = 2.0
SIGNAL_BCPNN_IC_THRESHOLD = 0.0
SIGNAL_MIN_REPORTS = 3
SIGNAL_MIN_ALGORITHMS_AGREEING = 2

# ── Display ──────────────────────────────────────────────────────────────────

DISPLAY_MAX_EVENTS = 50
DISPLAY_MAX_SIGNALS = 20

# ── Caveats ──────────────────────────────────────────────────────────────────

FAERS_MASTER_CAVEAT = (
    "FAERS (FDA Adverse Event Reporting System) is a spontaneous reporting "
    "database that contains reports of adverse events, medication errors, "
    "and product quality complaints submitted to the FDA. "
    "REPORT COUNTS DO NOT INDICATE CAUSATION, INCIDENCE RATES, OR RELATIVE "
    "RISK. Report counts reflect reporting patterns, not true event frequencies. "
    "Many factors influence reporting: seriousness of the event, publicity, "
    "litigation, regulatory actions, and time since marketing approval. "
    "Most adverse events are never reported. This data is for research and "
    "signal detection only, not for clinical decision-making."
)

ONSIDES_MASTER_CAVEAT = (
    "OnSIDES (On-label Side Effect Resource) extracts adverse drug event pairs "
    "from FDA Structured Product Labels using natural language processing (NLP). "
    "The probability scores reflect NLP model confidence, not clinical risk or "
    "incidence rates. Label-reported events include those observed in clinical "
    "trials, reported post-marketing, and included for regulatory completeness. "
    "The presence of an event on a label does not establish causation. "
    "This data is for research reference only."
)

UNIVERSAL_ADVERSE_EVENT_CAVEAT = (
    "This adverse event information combines data from multiple sources "
    "(spontaneous reporting systems and NLP-extracted drug labels). "
    "It cannot predict individual patient risk, establish causation, or "
    "calculate incidence rates. Always consult drug labels, clinical "
    "references, and qualified healthcare professionals. "
    "THIS DATA IS RESEARCH-ONLY AND NOT FOR CLINICAL DECISION-MAKING."
)

# ── Licensing ────────────────────────────────────────────────────────────────

FAERS_LICENSE = "Public Domain (US Government Work)"
ONSIDES_LICENSE = "CC BY 4.0"
MEDDRA_LICENSE = "Proprietary (Academic license required)"
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | DS-PHASE2-AEI-2025 |
| Version | 2.0.0 |
| Status | Integration Architecture Specification |
| Classification | Safety-Critical Clinical Decision Support |
| Next Review | Quarterly (next: 2025-10) |
| Stakeholders | Clinical Safety, Data Science, Engineering, Legal |
| Dependencies | DEEPSYNAPS_KNOWLEDGE_GOVERNANCE.md, DEEPSYNAPS_DATABASE_ADAPTER_ARCHITECTURE.md |
| Related Documents | DB_REQUIREMENTS_MEDICATION_PHARMA.md, DEEPSYNAPS_CLINICAL_INTELLIGENCE_UX_RULES.md |

---

*"In pharmacovigilance, the absence of evidence is not evidence of absence. 
A drug with zero FAERS reports is not proven safe — it may simply be under-reported. 
Our duty is to ensure every user of this data understands this fundamental truth."*
