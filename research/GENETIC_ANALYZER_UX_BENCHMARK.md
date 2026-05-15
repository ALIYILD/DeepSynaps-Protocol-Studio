# Pharmacogenomics / Genetic Analyzer Platform UX Benchmark Report

**Document Version:** 1.0
**Date:** July 2025
**Purpose:** Comprehensive benchmark of pharmacogenomics platform user experience, report design patterns, dashboard components, color scheme standards, interaction patterns, mobile considerations, and accessibility requirements.
**Target Audience:** UX Designers, Product Managers, Clinical Informaticists, Pharmacogenomics Platform Developers

---

## Table of Contents

1. [GeneSight (Assurex Health / Myriad Genetics)](#1-genesight-assurex-health--myriad-genetics)
2. [Genomind (Myriad Genetics)](#2-genomind-m myriad-genetics)
3. [Tempus xT/xF](#3-tempus-xtxf)
4. [OneOme RightMed](#4-oneome-rightmed)
5. [Invitae Pharmacogenomics](#5-invitae-pharmacogenomics)
6. [Clinical Genetics Portals](#6-clinical-genetics-portals)
7. [Report Design Patterns](#7-report-design-patterns)
8. [Dashboard Components](#8-dashboard-components)
9. [Color Scheme Standards](#9-color-scheme-standards)
10. [Interaction Patterns](#10-interaction-patterns)
11. [Mobile Considerations](#11-mobile-considerations)
12. [Accessibility](#12-accessibility)

---

## 1. GeneSight (Assurex Health / Myriad Genetics)

### 1.1 Overview

GeneSight is one of the most widely recognized pharmacogenomic testing platforms in psychiatry. The platform evaluates patient DNA to determine how they may metabolize or respond to psychiatric medications. The test covers antidepressants, anxiolytics & hypnotics, antipsychotics, medications for tardive dyskinesia, mood stabilizers, and stimulants/non-stimulants used for ADHD.

**Key Metrics:**
- **Medications covered:** 60+ FDA-approved mental health medications
- **Genes tested:** CYP2D6, CYP2C19, CYP2C9, CYP3A4, CYP1A2, CYP2B6, COMT, MTHFR, HTR2A, SLC6A4, HLA-A, HLA-B, UGT1A4, UGT2B15, OPRM1
- **Primary audience:** Psychiatrists, psychiatric nurse practitioners, primary care providers
- **Delivery model:** Prescriber-ordered, insurance-billed

### 1.2 Report Structure

The GeneSight Psychotropic Report follows a standardized multi-section layout designed for rapid clinical interpretation:

```
SECTION 1: Cover Page
- Patient demographics (name, DOB, test date)
- Ordering provider information
- CLIA/CAP certification identifiers
- Test methodology summary

SECTION 2: Color-Coded Medication Categories
- Green: "Use as Directed"
- Yellow: "Moderate Gene-Drug Interaction"
- Red: "Significant Gene-Drug Interaction"
- Separate sections for Non-Smokers and Smokers (CYP1A2 inducible variant)

SECTION 3: Clinical Considerations
- Numbered annotations (1-N) associated with each medication
- Provides rationale for medication classification
- Guides treatment decisions with specific recommendations

SECTION 4: Additional Genotypes
- COMT genotype (informational purposes only)
- MTHFR genotype
- Pharmacodynamic gene results

SECTION 5: Gene-Drug Interaction Chart
- Matrix of medications × pharmacokinetic genes
- Dots: shaded (variant found), unshaded (normal), half-shaded (smoking-dependent)

SECTION 6: Medication List by Drug Class
- Antidepressants
- Anxiolytics & Hypnotics
- Antipsychotics
- Tardive Dyskinesia Medications
- Mood Stabilizers
- Stimulants & Non-Stimulants (ADHD)

SECTION 7: Methodology & Limitations
- Test methodology description
- Gene list and variants tested
- Limitations and disclaimers
```

### 1.3 Gene-Drug Interaction Visualization

The GeneSight report uses a **dot-matrix chart** as its primary visualization:

| Visual Element | Description | Purpose |
|---|---|---|
| **Shaded Dot** | Filled circle indicating gene variant found | Signals pharmacokinetic gene variation impacting metabolism |
| **Unshaded Dot** | Empty circle indicating normal phenotype | Shows gene involvement but normal patient status |
| **Half-Shaded Dot** | Half-filled circle for smoking-dependent CYP1A2 | Indicates phenotype varies by smoking status |
| **No Dot** | Blank cell | Gene is not involved in medication metabolism |

**Chart Layout:**
- **Columns:** Pharmacokinetic genes (CYP2D6, CYP2C19, CYP2C9, CYP3A4, CYP1A2, CYP2B6)
- **Rows:** Medications listed alphabetically within color categories
- **Organization:** Medications grouped by color category (green, yellow, red)

### 1.4 Metabolizer Status Display

GeneSight does not prominently display individual metabolizer phenotypes on the main report pages. Instead, metabolizer status is incorporated into the algorithm that drives the color-coded medication categories. The patient's metabolizer status for each CYP450 gene is:

- Inferred from the genotype
- Processed through a proprietary algorithm
- Translated into medication-level color coding
- Available in the gene-drug interaction chart via dot shading

**Metabolizer Types Referenced:**
- Poor Metabolizer (PM): Medication broken down very slowly
- Intermediate Metabolizer (IM): Slow rate of metabolism
- Extensive/Normal Metabolizer (EM): Normal rate of metabolism
- Ultrarapid Metabolizer (UM): Medication rapidly broken down

### 1.5 Color Coding System

| Color | Category | Clinical Meaning | Action |
|---|---|---|---|
| **Green** | "Use as Directed" | No genetic issues expected to change medication outcomes | Prescribe as normal; standard monitoring |
| **Yellow** | "Moderate Gene-Drug Interaction" | May require dose adjustments, may be less likely to work, or may cause side effects | Slow down; be thoughtful; consider dose adjustments or closer monitoring |
| **Red** | "Significant Gene-Drug Interaction" | Likely to require dose adjustments, may be less likely to work, or may cause side effects | Stop and proceed with caution; genetics expected to have greater impact |

The "stoplight analogy" is frequently used in GeneSight training materials:
- **Green:** Proceed through intersection normally
- **Yellow:** Slow down and be more thoughtful
- **Red:** Stop and proceed with caution (but not an absolute prohibition)

### 1.6 Clinical Action Categories

GeneSight uses **numbered Clinical Considerations** instead of explicit action labels:

1. Clinical considerations appear as superscript numbers next to medications
2. Numbers reference a separate legend section with detailed explanations
3. Each consideration explains the rationale for the medication's classification
4. Considerations may include:
   - Dose adjustment recommendations
   - Increased monitoring suggestions
   - Alternative medication considerations
   - Risk of specific adverse effects

**Medication Sorting Within Categories:**
- Alphanumeric ordering
- Medications with fewer clinical considerations placed at top
- Medications with more considerations placed lower

### 1.7 Medication List Integration

GeneSight organizes medications into six drug classes:

1. **Antidepressants** - SSRIs, SNRIs, TCAs, MAOIs, atypical antidepressants
2. **Anxiolytics & Hypnotics** - Benzodiazepines, non-benzodiazepine hypnotics, buspirone
3. **Antipsychotics** - Typical and atypical antipsychotics
4. **Tardive Dyskinesia Medications** - Deutetrabenazine, valbenazine
5. **Mood Stabilizers** - Lithium, lamotrigine, valproic acid, carbamazepine, oxcarbazepine
6. **Stimulants & Non-Stimulants (ADHD)** - Methylphenidate, amphetamines, atomoxetine, guanfacine, clonidine

**Smoking Status Sections:**
- Separate Non-Smokers and Smokers sections for CYP1A2-inducible medications
- Applies only to patients with the highly inducible CYP1A2 variant (~91% of patients)
- Smoking defined as daily inhalation of burning plant material (cigarettes, marijuana)
- Excludes vaping and e-cigarettes

### 1.8 Report Sections Detail

**Section A - Cover/Header:**
```
+----------------------------------------------------+
| GeneSight Psychotropic Test Report                  |
| Patient: [Name]    DOB: [Date]    Test Date: [Date]|
| Ordering Provider: [Name]                           |
| CLIA: [Number]    CAP: [Number]                    |
+----------------------------------------------------+
```

**Section B - Color-Coded Medication Grid:**
```
+----------------------------------------------------+
| USE AS DIRECTED (Green)                           |
| - Bupropion (Wellbutrin)                          |
| - Escitalopram (Lexapro)                          |
| - Sertraline (Zoloft)                             |
+----------------------------------------------------+
| MODERATE GENE-DRUG INTERACTION (Yellow)           |
| - Fluoxetine (Prozac) 1,2                         |
| - Paroxetine (Paxil) 1,3,4                        |
+----------------------------------------------------+
| SIGNIFICANT GENE-DRUG INTERACTION (Red)           |
| - Amitriptyline 1,2,5,6                            |
| - Clomipramine 1,2,3,7                             |
+----------------------------------------------------+
```

**Section C - Clinical Considerations Legend:**
```
1. CYP2D6 poor metabolizer - reduced metabolism predicted
2. May require dose reduction
3. Increased risk of side effects
4. Consider alternative medication
5. Active metabolite may not be produced
6. CYP2C19 intermediate metabolizer - monitor levels
```

**Section D - Gene-Drug Interaction Chart:**
```
+--------------------------------------------------------+
| Medication    | CYP2D6 | CYP2C19 | CYP3A4 | CYP1A2 | ...|
+--------------------------------------------------------+
| Fluoxetine    |   SH   |   US    |   US   |   --   |    |
| Paroxetine    |   SH   |   US    |   US   |   --   |    |
| Bupropion     |   --   |   --    |   SH   |   HS   |    |
| ...           |        |         |        |        |    |
+--------------------------------------------------------+
SH=Shaded, US=Unshaded, HS=Half-Shaded, --=No dot
```

---

## 2. Genomind (Myriad Genetics)

### 2.1 Overview

Genomind (formerly independent, now part of Myriad Genetics) offers the Genecept Assay and the more recent Genomind PGx test, focusing on psychiatric and neurological medication management. Genomind emphasizes a dual approach: pharmacokinetic (CYP450) genes plus pharmacodynamic (neuropsychiatric marker) genes.

**Key Metrics:**
- **Genes tested:** 26-27 genes (including CYP450s and pharmacodynamic genes)
- **Software platform:** GenMedPro Precision Medicine Software
- **Gene panel emphasis:** Neuropsychiatric markers plus core drug-metabolizing enzymes
- **Specialties served:** Psychiatry, Neurology, Cardiology, Primary Care, Pain Management, Gastroenterology, Oncology, Infectious Disease

### 2.2 Professional PGx Report

The Genomind report is structured as a comprehensive clinical document with distinct sections:

```
SECTION 1: Patient Information & Report Header
- Patient name, ID, DOB, sex
- Specimen details (type, dates)
- Ordering provider information
- Test methodology and limitations

SECTION 2: Executive Summary / Results Overview
- Genes with abnormal results highlighted
- Summary of pharmacokinetic gene variations
- Summary of pharmacodynamic gene variations
- Overall interpretation statement

SECTION 3: Pharmacokinetic Gene Variations Table
- Gene name
- Patient genotype (star allele nomenclature)
- Phenotype term (e.g., Poor Metabolizer, Normal Metabolizer)
- Allele function summary
- Therapeutic implications
- Clinical impact guidance

SECTION 4: Pharmacodynamic Gene Variations
- SLC6A4 (Serotonin Transporter)
- CACNA1C (Calcium Channel)
- ANK3 (Ankyrin G)
- 5HT2C (Serotonin Receptor)
- MC4R (Melanocortin 4 Receptor)
- DRD2 (Dopamine D2 Receptor)
- COMT (Catechol-O-Methyltransferase)
- ADRA2A (Alpha-2A Adrenergic Receptor)
- MTHFR (Methylenetetrahydrofolate Reductase)
- BDNF (Brain-Derived Neurotrophic Factor)
- OPRM1 (Mu Opioid Receptor)
- GRIK1 (Glutamate Receptor)
- HLA-B*15:02 and HLA-A*31:01 (Hypersensitivity)

SECTION 5: Drug Interaction Summary
- Medication-specific guidance
- Gene-drug interaction annotations
- CYP450-mediated interaction alerts

SECTION 6: Patient Drug Metabolism Card
- Wallet card with six liver enzymes
- Patient genotype summary
- For sharing with other healthcare providers

SECTION 7: Literature References
- Gene-by-gene reference lists
- Evidence-based citations
```

### 2.3 Gene Panel Display

Genomind uses a **table-based gene panel display** for pharmacokinetic results:

| Gene | Result | Phenotype | Therapeutic Implications | Clinical Impact |
|---|---|---|---|---|
| CYP2D6 | *4/*4 [Low activity] | Poor Metabolizer | Risk of elevated serum levels & drug interactions, or decreased production of active metabolites. Dose adjustment or alternate therapy may be considered. | Be advised that there may be altered exposure to medications metabolized by CYP2D6. Use GenMed Pro for a more complete drug-gene-environment interaction assessment. |
| CYP1A2 | *1A/*1A [Normal activity] | Normal Metabolizer | Variations in CYP1A2 can result in altered drug metabolism and unexpected drug serum levels. This genotype confers normal activity. | Normal metabolism is expected (other factors may influence metabolism). |
| CYP2C19 | *1/*1 [Normal activity] | Normal Metabolizer | Variations in CYP2C19 can result in altered drug metabolism. This genotype confers normal activity. | Normal metabolism is expected (other factors may influence metabolism). |
| CYP2C9 | *1/*1 [Normal activity] | Normal Metabolizer | Variations in CYP2C9 can result in altered drug metabolism. This genotype confers normal activity. | Normal metabolism is expected. |
| CYP2B6 | *6/*6 [Low activity] | Poor Metabolizer | Risk of elevated serum levels & drug interactions. Dose adjustment or alternate therapy may be considered. | Be advised that there may be altered exposure to medications metabolized by CYP2B6. |
| CYP3A4/5 | *1/*1 [Normal activity] | Normal Metabolizer | Variations in CYP3A4/5 can result in altered drug metabolism. This genotype confers normal activity. | Normal metabolism is expected. |

**Phenotype Terminology Used:**
- Ultrarapid Metabolizer (UM)
- Rapid Metabolizer (RM)
- Normal Metabolizer (NM) / Extensive Metabolizer (EM)
- Intermediate Metabolizer (IM)
- Poor Metabolizer (PM)

### 2.4 Medication Guidance

Genomind provides medication guidance through:

1. **GenMedPro Precision Medicine Software** - Interactive provider portal
   - Analyzes gene-drug and drug-drug interactions simultaneously
   - Pre-populates patient PGx results and medication profiles
   - Provides dynamic medication plan adjustments
   - Supports polypharmacy interaction guidance

2. **Drug Interaction Summary in Report**
   - CYP450-mediated interaction annotations
   - Medication-specific clinical alerts
   - Dose adjustment recommendations
   - Alternative medication suggestions

**GenMedPro Features:**
- Patient management dashboard with filtering options
- Risk targeting for patients with potential interactions
- Testing status tracking
- Detailed and summarized result views
- Medication search tool
- Environmental factor adjustments (smoking, coffee)
- Pharmacogenetic expert consultation scheduling

### 2.5 Report Layout

The Genomind report uses a **formal clinical laboratory report layout:**

- **Header:** Patient demographics, specimen details, ordering provider, CLIA identifiers
- **Body:** Structured tables for gene results
- **Typography:** Clinical-style formatting with formal medical terminology
- **Color Usage:** Minimal color on the printed report; primarily text-based
- **Tables:** Grid-based presentation with clearly delineated columns
- **Alerts:** Icon-based or text-based alert/caution indicators for significant findings

### 2.6 Interactive Elements

Genomind's interactivity is primarily delivered through the **GenMedPro web platform:**

| Feature | Description | Interaction Type |
|---|---|---|
| **Patient Dashboard** | Filterable patient list with status indicators | Click to view patient detail |
| **PGx Results Viewer** | Detailed/summarized result views | Toggle between detail/summary |
| **Medication Search** | Add/change medications in patient profile | Search with autocomplete |
| **Interaction Checker** | Gene-drug and drug-drug interaction analysis | Real-time analysis display |
| **Environmental Factors** | Adjust for smoking, caffeine, other factors | Checkbox/slider inputs |
| **Expert Consultation** | Schedule PGx expert consultations | Button-triggered scheduling |

### 2.7 Provider Portal

The **GenMedPro Precision Health Platform** serves as Genomind's provider portal:

```
+----------------------------------------------------------+
| GenMedPro Dashboard                                       |
+----------------------------------------------------------+
| [Search Patients] [Filter by Risk] [Filter by Status]    |
+----------------------------------------------------------+
| Patient List                                              |
| - Doe, John    | Test Complete | Moderate Risk | [View]  |
| - Smith, Jane  | In Progress   | --            | [View]  |
| - Lee, Robert  | Test Complete | High Risk     | [View]  |
+----------------------------------------------------------+
| Patient Detail View (selected)                            |
+----------------------------------------------------------+
| [Summary] [Detailed Results] [Medications] [Interactions]|
+----------------------------------------------------------+
| Gene Results:                                             |
| CYP2D6: PM | CYP2C19: NM | CYP2C9: NM | CYP1A2: EM   |
+----------------------------------------------------------+
| Medications:                                              |
| Current: Fluoxetine, Clonazepam                          |
| [Add Medication] [Check Interactions]                    |
+----------------------------------------------------------+
```

---

## 3. Tempus xT/xF

### 3.1 Overview

Tempus is a technology company advancing precision medicine through artificial intelligence. The Tempus xT assay is a broad next-generation sequencing (NGS) panel covering 648 genes, while the xF assay is a liquid biopsy test. Tempus integrates oncology, psychiatry, and other therapeutic areas.

**Key Metrics:**
- **xT gene list:** 648 genes (DNA sequencing)
- **RNA profiling:** Available for subset of genes
- **Pharmacogenomic genes included:** CYP2D6, CYP3A5, CYP1B1, TPMT, NUDT15, DPYD, UGT1A1, HLA genes
- **Specialty areas:** Oncology (primary), psychiatry, cardiology
- **Technology:** NGS-based with AI-driven insights

### 3.2 Oncology + Psychiatry Genomics

Tempus offers an integrated approach that bridges oncology and psychiatry:

**Oncology Focus (xT):**
- Comprehensive molecular profiling
- Somatic mutation detection
- Microsatellite instability (MSI) testing
- Tumor mutational burden (TMB)
- PD-L1 expression analysis
- Fusion detection
- Copy number variation (CNV) analysis

**Psychiatry Integration:**
- Pharmacogenomic variants within the xT panel
- Psychotropic medication metabolism guidance
- CYP450 phenotype reporting
- HLA allele testing for hypersensitivity risk

### 3.3 Molecular Profile Display

Tempus presents molecular profiles through a **comprehensive genomic dashboard:**

```
+-----------------------------------------------------------+
| Tempus Molecular Profile Report                            |
+-----------------------------------------------------------+
| Patient: [Name] | Tumor: [Type] | Specimen: [ID]          |
+-----------------------------------------------------------+
| GENOMIC ALTERATIONS SUMMARY                                |
+-----------------------------------------------------------+
| [Mutation 1]  [Mutation 2]  [Mutation 3]  [Mutation 4]   |
| PIK3CA E545K  TP53 R175H    ERBB2 amp     MYC amp       |
| Pathogenic    Pathogenic    Pathogenic    Likely Path     |
+-----------------------------------------------------------+
| VARIANT DETAILS                                            |
+-----------------------------------------------------------+
| Gene | Variant | Type | AF | Clinical Significance         |
|------+---------+------+----+--------------------------------|
| EGFR | L858R   | SNV  | 23%| Sensitizing to EGFR TKI     |
| KRAS | G12D    | SNV  | 45%| Resistance to EGFR TKI      |
+-----------------------------------------------------------+
| BIOMARKERS                                                 |
+-----------------------------------------------------------+
| TMB: 12.4 mut/Mb (High)                                  |
| MSI: Stable                                                |
| PD-L1: 85% (High)                                        |
+-----------------------------------------------------------+
| PHARMACOGENOMICS                                           |
+-----------------------------------------------------------+
| CYP2D6: Normal Metabolizer (*1/*2)                       |
| CYP2C19: Intermediate Metabolizer (*1/*2)                |
| TPMT: Normal Metabolizer (*1/*1)                         |
| HLA-B*15:02: Negative                                    |
+-----------------------------------------------------------+
```

### 3.4 Clinical Trial Matching

Tempus offers **clinical trial matching** as a key differentiator:

| Feature | Description |
|---|---|
| **Trial Matching Algorithm** | AI-driven matching based on molecular profile |
| **Geographic Search** | Finds trials near patient's location |
| **Eligibility Filtering** | Matches based on genomic alterations |
| **Trial Details** | Phase, sponsor, contact information |
| **Recruitment Status** | Open, enrolling, closed indicators |

**Integration with Report:**
- Clinical trial options presented within the molecular profile report
- Matched based on actionable genomic alterations
- Geographic proximity filtering
- Phase and eligibility criteria displayed

### 3.5 Report Format

Tempus reports follow a **hierarchical digital format**:

1. **Executive Summary** - Key findings at a glance
2. **Genomic Alterations** - Detailed variant information
3. **Biomarkers** - TMB, MSI, PD-L1 status
4. **Therapeutic Implications** - FDA-approved therapies matched to alterations
5. **Clinical Trials** - Matched trial opportunities
6. **Pharmacogenomics** - Drug metabolism gene results
7. **Technical Details** - Methodology, coverage metrics

**Digital-First Design:**
- Interactive web-based reports
- Expandable sections for detailed information
- Hyperlinked references and clinical evidence
- Integrated with Tempus provider portal
- PDF export available

### 3.6 Provider Dashboard

The Tempus provider portal offers:

```
+-----------------------------------------------------------+
| Tempus Provider Portal                                     |
+-----------------------------------------------------------+
| [Patient Search] [Orders] [Reports] [Clinical Trials]      |
+-----------------------------------------------------------+
| Case Summary                                               |
| - Total Cases: [N]  - Pending: [N]  - Final: [N]         |
+-----------------------------------------------------------+
| Recent Reports                                             |
| Patient | Test | Status | Key Finding | Date | Action      |
|---------|------|--------|-------------|------|------------|
| [Name]  | xT   | Final  | PIK3CA E545K| 1/15 | [View]     |
| [Name]  | xF   | Pending| --          | 1/14 | [Track]    |
+-----------------------------------------------------------+
| Molecular Insights                                         |
| - Matched Therapies: [N]                                  |
| - Matched Trials: [N]                                     |
| - PGx Alerts: [N]                                         |
+-----------------------------------------------------------+
```

---

## 4. OneOme RightMed

### 4.1 Overview

OneOme (now part of Invitae/Labcorp) offers the RightMed Comprehensive Test, a pharmacogenomic test that analyzes how a patient's DNA affects their response to hundreds of medications across multiple specialties.

**Key Metrics:**
- **Medications covered:** Hundreds across 20+ drug classes
- **Gene panel:** 27 genes
- **Test versions:** RightMed Comprehensive, RightMed Advisor
- **Delivery model:** Provider-ordered, CLIA-certified laboratory

### 4.2 Gene Panel

The RightMed test analyzes variants in 27 genes:

**Drug-Metabolizing Enzymes:**
- CYP2D6, CYP2C19, CYP2C9, CYP2B6, CYP1A2, CYP3A4, CYP3A5

**Transporters:**
- SLCO1B1, ABCB1

**Other Pharmacogenes:**
- VKORC1, CYP4F2, DPYD, TPMT, NUDT15, UGT1A1, HLA-B, HLA-A

### 4.3 Medication Interaction Matrix

OneOme uses a **categorized medication list** organized by medical specialty with four interaction levels:

| Category | Description | Visual Indicator |
|---|---|---|
| **Major Gene-Drug Interaction** | Significant effect on metabolism; elevated risk of adverse reaction or loss of efficacy | Dark icon with medication name |
| **Moderate Gene-Drug Interaction** | Moderate effect on metabolism; elevated risk | Medium icon with medication name |
| **Minimal Gene-Drug Interaction** | Does not significantly affect metabolism | Light icon with medication name |
| **Limited Pharmacogenetic Impact** | No pharmacogenetic variants with significant impact | Neutral text formatting |

**Report Legend Icons:**

| Icon | Meaning | Description |
|---|---|---|
| **Up Arrow** | Increased exposure | Total exposure to active compound(s) may be increased. Monitor for adverse effects. |
| **Down Arrow** | Decreased exposure | Total exposure to active compound(s) may be decreased. Monitor for lack of therapeutic response. |
| **Question Mark** | Difficult to predict | Total exposure to active compound(s) is difficult to predict. Monitor patient response. |
| **X/Reduce** | Reduced response | Response to medication may be lowered due to genetic changes impacting mechanisms other than exposure. |
| **Test Tube** | Additional testing | According to FDA labeling, additional laboratory testing may be indicated. |
| **Guideline Badge** | Professional guideline | Professional guidelines (FDA/CPIC) associated with patient's genetic test results. Avoidance, dose adjustment, or heightened monitoring may be indicated. |

### 4.4 Report Design

The RightMed report uses a **formal clinical document layout** with these sections:

```
SECTION 1: Report Header
- Patient name, DOB
- Report date, ordering provider
- Ordering facility, product type
- OneOme order ID
- Lab director, CLIA, CAP, NPI identifiers

SECTION 2: Report Legend
- Four interaction category definitions
- Icon legend with explanations
- Methodology notes

SECTION 3: Summary for Medications of Interest
- Medications entered during order process
- Gene-drug interaction classification
- Associated gene(s)
- Detail annotations with exposure predictions

SECTION 4: Genotype-Predicted Interactions by Drug Class
- Allergy/Pulmonology
- Analgesic/Anesthesiology
- Anti-inflammatory
- Anticoagulant/Antiplatelet
- Cardiovascular
- Endocrinology
- Gastroenterology
- Genetic Disease
- Immunosuppression
- Infectious Disease
- (and 10+ additional drug classes)

SECTION 5: Gene and Phenotype Summary
- Patient genotype for each gene tested
- Predicted phenotype (metabolizer status)
- Activity scores where applicable

SECTION 6: Secondary Findings
- Carrier status for pathogenic variants
- Genetic counseling recommendations

SECTION 7: Methodology & Limitations
```

### 4.5 Color Scheme

OneOme RightMed uses a **minimal color approach** in the printed PDF report:

- **Text-heavy design:** Primary reliance on textual categorization
- **Category headers:** Bold text for major/moderate/minimal/limited categories
- **Icon-based visual cues:** Directional arrows for exposure changes
- **Medication indicators:** Square checkboxes (■) for flagged medications
- **Superscript references:** Numbered annotations linking to clinical evidence

**In the RightMed Advisor (Interactive Tool):**
- Color-coded interaction severity
- Interactive medication cards
- Filterable drug lists
- Dynamic interaction checking

### 4.6 Action Categories

OneOme uses **four explicit action categories**:

| Category | Clinical Action | Evidence Integration |
|---|---|---|
| **Major** | Avoidance, dose adjustment, or heightened monitoring indicated | Professional guidelines (FDA/CPIC) available |
| **Moderate** | Consider dose adjustment or monitoring | Evidence supports moderate interaction |
| **Minimal** | Standard prescribing; no special genetic considerations | Minimal pharmacogenetic impact |
| **Limited** | Standard prescribing; genetic variants don't significantly impact response | No pharmacogenetic variants with clinical impact |

---

## 5. Invitae Pharmacogenomics

### 5.1 Overview

Invitae (now part of Labcorp) offers broad genetic testing services including pharmacogenomic panels. Invitae emphasizes accessibility, with comprehensive test offerings that span diagnostic, proactive, and reproductive genetics.

**Key Metrics:**
- **Test catalog:** Broad genetic testing catalog
- **Ordering options:** Online portal, paper, access programs
- **Delivery model:** Provider-ordered and direct-to-consumer options
- **Turnaround time:** 10-21 days for most tests
- **Genetic counseling:** Included at no additional cost

### 5.2 Test Ordering Workflow

```
+-----------------------------------------------------------+
| Invitae Ordering Workflow                                  |
+-----------------------------------------------------------+
| Step 1: Select and Submit Order                           |
|   [Order Online]  [Order on Paper]  [Access Program]      |
+-----------------------------------------------------------+
| Step 2: Collect and Return Specimen                       |
|   - Kit provided with prepaid shipping label              |
|   - FedEx pickup scheduling available                     |
+-----------------------------------------------------------+
| Step 3: Receive Results                                   |
|   - Email notification when ready                         |
|   - View/save/print from online account                   |
|   - Genetic counseling available                          |
+-----------------------------------------------------------+
```

**Ordering Methods:**

| Method | Process | Best For |
|---|---|---|
| **Online Portal** | Browse catalog, select panel, submit electronically | Efficient processing, faster report delivery |
| **Paper Form** | Download PDF, complete manually, fax/mail | Providers preferring paper workflows |
| **Access Program** | Eligibility-based ordering for specific conditions | Patients meeting program criteria |

**Gia Clinical Chatbot:**
- HIPAA-compliant clinical chatbot
- Facilitates patient intake, education, risk assessment
- Automatic delivery of results in some cases
- Used by 100,000+ patients and providers

### 5.3 Result Portal

The Invitae result portal provides:

- **Secure online account access** for viewing results
- **View, save, or print** patient reports
- **Clear next steps** information included with reports
- **Gene-specific guides** created by experts
- **Peer-to-peer support** from genetic counselors
- **Patient counseling** directly available
- **Post-test counseling** sessions (no additional charge for qualifying tests)

### 5.4 Gene-Drug Table

Invitae reports include gene-drug interaction tables with:

- **Gene names** with official nomenclature
- **Genotype results** using standard HGVS nomenclature
- **Predicted phenotype** (metabolizer status)
- **Activity scores** where applicable (CPIC standard)
- **Clinical annotations** with evidence levels
- **Medication associations** with interaction descriptions

**Example Table Structure:**
```
+-----------------------------------------------------------+
| Gene    | Genotype  | Phenotype     | Clinical Notes       |
+-----------------------------------------------------------+
| CYP2D6  | *1/*4     | IM            | Monitor for ADR     |
| CYP2C19 | *1/*2     | IM            | Dose adjust SSRIs   |
| CYP2C9  | *1/*1     | NM            | No action needed    |
| CYP3A5  | *3/*3     | NM (expresser)| Standard dosing     |
+-----------------------------------------------------------+
```

### 5.5 Clinical Annotations

Invitae integrates clinical annotations from multiple sources:

- **CPIC Guidelines:** Clinical Pharmacogenetics Implementation Consortium
- **DPWG Guidelines:** Dutch Pharmacogenetics Working Group
- **FDA Labels:** Pharmacogenomic biomarker table
- **PharmGKB:** Pharmacogenomics Knowledge Base annotations
- **Evidence scoring:** Clinical annotation scores with level of evidence

---

## 6. Clinical Genetics Portals

### 6.1 GeneDx

**Overview:**
GeneDx specializes in exome and genome sequencing, offering comprehensive genetic testing services. While not exclusively a pharmacogenomics company, GeneDx includes pharmacogenomic variants within its broader genetic testing portfolio.

**Report Characteristics:**
- Comprehensive variant interpretation
- Formal clinical laboratory report format
- ACMG/AMP variant classification standards
- Gene-specific clinical summaries
- Detailed methodology sections
- Genetic counseling integration

**Portal Features:**
- Secure online result portal
- Variant classification with evidence
- Family variant testing coordination
- Clinical decision support tools

### 6.2 Blueprint Genetics

**Overview:**
Blueprint Genetics offers diagnostic genetic testing with emphasis on high-quality clinical statements accessible through the Nucleus online portal.

**Report Design:**

```
+-----------------------------------------------------------+
| Blueprint Genetics Clinical Statement                      |
+-----------------------------------------------------------+
| Page 1: Summary of Results                                 |
|   - Primary findings                                       |
|   - Secondary findings                                     |
|   - Additional findings                                    |
|   - Sequencing performance metrics                         |
+-----------------------------------------------------------+
| Subsequent Pages:                                          |
|   - Patient clinical history                               |
|   - Sequence alterations table                             |
|     (Gene, variant, position, consequence, HGVS,          |
|      genotype, gnomAD frequency, classification)           |
|   - Literature review                                      |
|   - In silico predictions                                  |
|   - Concluding remarks                                     |
|   - Management recommendations                             |
+-----------------------------------------------------------+
```

**Nucleus Portal Features:**
- Electronic report access for all customers
- Additional information (sequencing coverage, technologies)
- Summary of primary, secondary, and additional findings on first page
- Variant classification following ACMG guidelines
- Orthogonal confirmation details
- Report signed by clinical interpretation experts and lab director

**Report Improvement History:**
- Updated to provide quicker overview access
- Summary of results added to first page
- Classification clearly stated
- Detailed literature review section

### 6.3 Ambry Genetics

**Overview:**
Ambry Genetics offers a comprehensive suite of genetic testing services. Their reports follow established clinical genetics standards with emphasis on variant interpretation and clinical actionability.

**Report Characteristics:**
- Standard clinical laboratory report format
- Variant classification (Pathogenic, Likely Pathogenic, VUS, Likely Benign, Benign)
- Gene-level clinical annotations
- Evidence-based variant interpretation
- Family history integration
- Genetic counseling coordination

**Portal Design:**
- Provider-facing web portal
- Patient result management
- Family testing coordination
- Clinical decision support

### 6.4 Report Comparison Matrix

| Feature | GeneDx | Blueprint Genetics | Ambry Genetics |
|---|---|---|---|
| **Primary Focus** | Exome/Genome + Targeted Panels | Diagnostic genetic testing | Comprehensive genetic testing |
| **Report Format** | Formal clinical report | Multi-section clinical statement | Standard clinical report |
| **Online Portal** | Yes | Nucleus Portal | Yes |
| **Variant Classification** | ACMG/AMP Standards | ACMG/AMP Standards | ACMG/AMP Standards |
| **Literature Review** | Detailed | Comprehensive variant-specific | Evidence-based |
| **First Page Summary** | Key findings | Primary/Secondary/Additional | Key findings |
| **Performance Metrics** | Coverage, depth | Sequencing performance | Coverage metrics |
| **Expert Sign-off** | Yes | Lab director + experts | Yes |
| **PGx Integration** | Within broader testing | Within diagnostic context | Available in select panels |
| **Genetic Counseling** | Available | Integrated | Coordinated |

---

## 7. Report Design Patterns

### 7.1 Gene Cards

The **gene card** is the fundamental UI component for displaying individual gene results. Based on analysis of all benchmarked platforms, the standard gene card follows this pattern:

```
+-----------------------------------------------------------+
| GENE CARD COMPONENT SPECIFICATION                          |
+-----------------------------------------------------------+
|                                                            |
|  +-----------------------------------------------------+  |
|  | [GENE SYMBOL]    [PHENOTYPE BADGE]    [EVIDENCE]   |  |
|  | CYP2D6           Poor Metabolizer      CPIC Level A |  |
|  +-----------------------------------------------------+  |
|  |                                                      |  |
|  |  Genotype: *4/*4 (Activity Score: 0.0)              |  |
|  |  Allele 1: *4 (No Function)                         |  |
|  |  Allele 2: *4 (No Function)                         |  |
|  |                                                      |  |
|  |  +-----------------------------------------------+  |  |
|  |  | CLINICAL IMPACT                                |  |  |
|  |  | Risk of elevated serum levels & drug          |  |  |
|  |  | interactions. May require dose adjustment     |  |  |
|  |  | or alternative therapy.                        |  |  |
|  |  +-----------------------------------------------+  |  |
|  |                                                      |  |
|  |  Affected Medications: [N]  [View All]             |  |
|  |                                                      |  |
|  |  [CPIC Guidelines] [FDA Label] [References]         |  |
|  +-----------------------------------------------------+  |
|                                                            |
+-----------------------------------------------------------+
```

**Gene Card Anatomy:**

| Element | Required | Description | Data Source |
|---|---|---|---|
| **Gene Symbol** | Yes | Official HGNC gene symbol | HGNC Database |
| **Gene Full Name** | Recommended | Descriptive gene name | GeneCards/OMIM |
| **Genotype** | Yes | Star allele or HGVS notation | Test result |
| **Phenotype** | Yes | Metabolizer/function status | CPIC Guidelines |
| **Activity Score** | Yes (for CYPs) | Numerical activity score | CPIC Standard |
| **Allele Functions** | Recommended | Function of each allele | CPIC/PharmVar |
| **Clinical Impact** | Yes | Summary of clinical significance | CPIC/FDA/DPWG |
| **Evidence Level** | Yes | CPIC Level (A/B/C/D) or LOE | CPIC/PharmGKB |
| **Affected Drugs Count** | Recommended | Number of impacted medications | Drug-gene mapping |
| **Guideline Links** | Recommended | Links to CPIC, FDA, DPWG | External references |
| **Copy Number** | Conditional | For CYP2D6 (CNV) | Test methodology |

**CSS Pattern for Gene Card:**

```css
.gene-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s ease;
}

.gene-card:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.gene-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.gene-card__symbol {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

.gene-card__phenotype-badge {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.gene-card__phenotype-badge--poor {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef5350;
}

.gene-card__phenotype-badge--intermediate {
  background: #fff3e0;
  color: #ef6c00;
  border: 1px solid #ffa726;
}

.gene-card__phenotype-badge--normal {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #66bb6a;
}

.gene-card__phenotype-badge--rapid {
  background: #e3f2fd;
  color: #1565c0;
  border: 1px solid #42a5f5;
}

.gene-card__phenotype-badge--ultrarapid {
  background: #f3e5f5;
  color: #7b1fa2;
  border: 1px solid #ab47bc;
}

.gene-card__genotype {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 14px;
  color: #424242;
}

.gene-card__clinical-impact {
  background: #fafafa;
  border-left: 4px solid #1976d2;
  padding: 12px;
  border-radius: 0 4px 4px 0;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.5;
}
```

### 7.2 Medication Matrix

The **medication matrix** (drug × gene interaction grid) is a core visualization component used across pharmacogenomics platforms:

```
+-----------------------------------------------------------+
| MEDICATION MATRIX COMPONENT SPECIFICATION                  |
+-----------------------------------------------------------+
|                                                            |
|        | CYP2D6 | CYP2C19 | CYP3A4 | CYP1A2 | CYP2C9 | ...|
|--------|--------|---------|--------|--------|--------|----|
| Fluoxetine | [PM] |  [NM]  |  [NM]  |  [--]  |  [--]  |    |
| Sertraline | [NM] |  [IM]  |  [NM]  |  [--]  |  [--]  |    |
| Citalopram | [NM] |  [PM]  |  [NM]  |  [--]  |  [--]  |    |
| Paroxetine | [PM] |  [NM]  |  [NM]  |  [--]  |  [--]  |    |
| ...      |        |         |        |        |        |    |
|                                                            |
| Legend: [PM]=Poor [IM]=Intermediate [NM]=Normal            |
|         [UM]=Ultrarapid [--]=Not applicable                 |
|                                                            |
+-----------------------------------------------------------+
```

**Matrix Design Specifications:**

| Element | Specification | Rationale |
|---|---|---|
| **Cell Size** | 40×40px minimum | Touch-friendly, readable |
| **Cell Shape** | Rounded rectangle (4px radius) | Modern, approachable |
| **Text Size** | 11-12px monospace | Consistent alignment |
| **Color Fill** | Based on phenotype | Immediate visual recognition |
| **Border** | 1px solid, slightly darker shade | Cell definition |
| **Hover State** | Lighten 10%, show tooltip | Interaction feedback |
| **Header Row** | Sticky/frozen on scroll | Context preservation |
| **Header Column** | Sticky/frozen on scroll | Context preservation |
| **Sort** | Alphabetically, by drug class, or by risk | User control |

**CSS Pattern for Medication Matrix:**

```css
.medication-matrix {
  overflow-x: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.medication-matrix__table {
  border-collapse: separate;
  border-spacing: 2px;
  min-width: 100%;
}

.medication-matrix__header-cell {
  position: sticky;
  top: 0;
  background: #37474f;
  color: #ffffff;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  z-index: 10;
}

.medication-matrix__row-header {
  position: sticky;
  left: 0;
  background: #f5f5f5;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  z-index: 5;
  border-right: 2px solid #e0e0e0;
}

.medication-matrix__cell {
  width: 44px;
  height: 44px;
  text-align: center;
  vertical-align: middle;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Roboto Mono', monospace;
  cursor: pointer;
  transition: all 0.15s ease;
}

.medication-matrix__cell--poor {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
}

.medication-matrix__cell--intermediate {
  background: #fff3e0;
  color: #e65100;
  border: 1px solid #ffcc80;
}

.medication-matrix__cell--normal {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.medication-matrix__cell--ultrarapid {
  background: #f3e5f5;
  color: #7b1fa2;
  border: 1px solid #ce93d8;
}

.medication-matrix__cell--na {
  background: #fafafa;
  color: #9e9e9e;
  border: 1px solid #eeeeee;
}

.medication-matrix__cell:hover {
  filter: brightness(1.1);
  transform: scale(1.05);
}
```

### 7.3 Metabolizer Status Visual Indicators

Metabolizer status is displayed using multiple complementary visual systems:

#### 7.3.1 Badge/Tag Style

```
+-----------------------------------------------------------+
| METABOLIZER BADGE COMPONENT                                |
+-----------------------------------------------------------+
|                                                            |
|  Ultrarapid Metabolizer  [UM]                              |
|  +----------------------------------------+               |
|  | [=High Activity]                       |               |
|  +----------------------------------------+               |
|                                                            |
|  Normal Metabolizer  [NM]                                  |
|  +----------------------------------------+               |
|  | [====Normal Activity====]              |               |
|  +----------------------------------------+               |
|                                                            |
|  Poor Metabolizer  [PM]                                    |
|  +----------------------------------------+               |
|  | [Low Activity]                         |               |
|  +----------------------------------------+               |
|                                                            |
+-----------------------------------------------------------+
```

#### 7.3.2 Gauge/Meter Style

```
+-----------------------------------------------------------+
| METABOLIZER GAUGE COMPONENT                                |
+-----------------------------------------------------------+
|                                                            |
|  CYP2D6 Metabolizer Status                                 |
|                                                            |
|  POOR    INTERMEDIATE    NORMAL    RAPID    ULTRARAPID    |
|  |==========|==========|====^====|==========|==========|  |
|                       YOU ARE HERE                         |
|                                                            |
|  Activity Score: 0.0 (Poor Metabolizer)                   |
|  Genotype: *4/*4                                          |
|                                                            |
+-----------------------------------------------------------+
```

#### 7.3.3 Color-Coded Bar Style

```
+-----------------------------------------------------------+
| METABOLIZER BAR COMPONENT                                  |
+-----------------------------------------------------------+
|                                                            |
| CYP2D6  |████████████████████████████████|  PM (0.0)      |
|          ^ Red zone - Significantly reduced activity       |
|                                                            |
| CYP2C19 |████████████░░░░░░░░░░░░░░░░░░░|  IM (0.5)      |
|          ^ Orange zone - Moderately reduced activity       |
|                                                            |
| CYP2C9  |░░░░░░░░░░░░░░░░████████████████|  NM (1.5)      |
|                      ^ Green zone - Normal activity        |
|                                                            |
| CYP3A4  |░░░░░░░░░░░░░░░░░░░░░░░█████████|  EM (2.0)      |
|                                 ^ Blue zone - Enhanced     |
|                                                            |
+-----------------------------------------------------------+
```

**CSS Pattern for Metabolizer Gauge:**

```css
.metabolizer-gauge {
  width: 100%;
  max-width: 400px;
  padding: 16px;
  background: #ffffff;
  border-radius: 8px;
}

.metabolizer-gauge__label {
  font-size: 14px;
  font-weight: 600;
  color: #37474f;
  margin-bottom: 8px;
}

.metabolizer-gauge__track {
  width: 100%;
  height: 24px;
  background: linear-gradient(to right,
    #c62828 0%,    /* Poor - Red */
    #c62828 20%,
    #ef6c00 20%,   /* Intermediate - Orange */
    #ef6c00 40%,
    #2e7d32 40%,   /* Normal - Green */
    #2e7d32 60%,
    #1565c0 60%,   /* Rapid - Blue */
    #1565c0 80%,
    #7b1fa2 80%,   /* Ultrarapid - Purple */
    #7b1fa2 100%
  );
  border-radius: 12px;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
}

.metabolizer-gauge__marker {
  position: absolute;
  top: -6px;
  width: 4px;
  height: 36px;
  background: #1a1a1a;
  border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.metabolizer-gauge__marker::after {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #1a1a1a;
}

.metabolizer-gauge__value {
  margin-top: 12px;
  font-size: 13px;
  color: #616161;
}

.metabolizer-gauge__zones {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### 7.4 Evidence Level Indicators

Evidence levels are displayed using **stars, badges, and grade labels**:

```
+-----------------------------------------------------------+
| EVIDENCE LEVEL COMPONENT                                   |
+-----------------------------------------------------------+
|                                                            |
| CPIC Guidelines:                                           |
|  Level A  [*****]  Strong evidence, actionable             |
|  Level B  [**** ]  Moderate evidence, actionable           |
|  Level C  [**   ]  Optional reporting                     |
|  Level D  [*    ]  Research only                          |
|                                                            |
| FDA Label:                                                 |
|  [FDA TABLE]  Listed on FDA Pharmacogenetic Associations  |
|  [FDA LABEL]  Mentioned in FDA drug label                 |
|  [FDA BOXED]  FDA Boxed Warning                           |
|                                                            |
| DPWG Guidelines:                                           |
|  [DPWG-1]  Gene-drug interaction: dose adjustment         |
|  [DPWG-2]  Gene-drug interaction: monitor                 |
|  [DPWG-3]  Gene-drug interaction: useful to know          |
|                                                            |
+-----------------------------------------------------------+
```

**Evidence Badge CSS:**

```css
.evidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.evidence-badge--cpic-a {
  background: #e8f5e9;
  color: #2e7d32;
}

.evidence-badge--cpic-b {
  background: #e3f2fd;
  color: #1565c0;
}

.evidence-badge--cpic-c {
  background: #fff3e0;
  color: #ef6c00;
}

.evidence-badge--cpic-d {
  background: #f5f5f5;
  color: #9e9e9e;
}

.evidence-badge--fda {
  background: #fce4ec;
  color: #c62828;
  border: 1px solid #f8bbd0;
}

.evidence-stars {
  color: #ffc107;
  font-size: 14px;
  letter-spacing: 1px;
}

.evidence-stars--empty {
  color: #e0e0e0;
}
```

### 7.5 Color Coding Standards for Reports

```
+-----------------------------------------------------------+
| COLOR CODING STANDARD - GENE-DRUG INTERACTIONS             |
+-----------------------------------------------------------+
|                                                            |
|  GREEN (#4CAF50) - Use as Directed                        |
|  +----------------------------------------------------+   |
|  | No significant genetic impact expected               |   |
|  | Standard prescribing recommended                    |   |
|  | No dose adjustment needed                           |   |
|  +----------------------------------------------------+   |
|                                                            |
|  YELLOW (#FF9800) - Moderate Interaction                  |
|  +----------------------------------------------------+   |
|  | Some genetic impact may affect response              |   |
|  | Consider dose adjustment or monitoring               |   |
|  | May be less effective or cause side effects          |   |
|  +----------------------------------------------------+   |
|                                                            |
|  RED (#F44336) - Significant Interaction                  |
|  +----------------------------------------------------+   |
|  | Strong genetic impact predicted                      |   |
|  | Significant dose adjustment likely needed            |   |
|  | Higher risk of adverse effects or lack of efficacy   |   |
|  | Consider alternative medication                      |   |
|  +----------------------------------------------------+   |
|                                                            |
|  GREY (#9E9E9E) - Insufficient Evidence                   |
|  +----------------------------------------------------+   |
|  | Not enough evidence for genetic prediction           |   |
|  | Standard prescribing with clinical monitoring        |   |
|  | Consider other clinical factors                      |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

### 7.6 Warning Icons and Alert System

```
+-----------------------------------------------------------+
| WARNING ICON SYSTEM                                        |
+-----------------------------------------------------------+
|                                                            |
|  CRITICAL ALERT (Red)                                      |
|  [!!!] Avoid - Serious adverse reaction risk              |
|  Used for: HLA-B*15:02 + carbamazepine/oxcarbazepine      |
|            HLA-B*57:01 + abacavir                         |
|            HLA-A*31:01 + carbamazepine                    |
|            DPYD deficiency + 5-FU/capecitabine            |
|                                                            |
|  MAJOR WARNING (Orange/Red)                                |
|  [!] Major gene-drug interaction                          |
|  Used for: Poor metabolizer + standard dose               |
|            Ultrarapid metabolizer + prodrug               |
|            Significantly altered exposure                 |
|                                                            |
|  MODERATE WARNING (Yellow)                                 |
|  [i] Moderate interaction - monitoring advised            |
|  Used for: Intermediate metabolizer                       |
|            Moderate exposure change                       |
|            Consider dose adjustment                       |
|                                                            |
|  INFORMATIONAL (Blue)                                      |
|  [?] Informational - no action required                   |
|  Used for: Normal metabolizer status                      |
|            Research-only findings                         |
|            Additional genotype information                |
|                                                            |
|  GUIDELINE AVAILABLE (Green/Blue)                          |
|  [G] Clinical guideline exists for this combination       |
|  Used for: CPIC Level A or B guidelines                   |
|            FDA pharmacogenomic labeling                   |
|            DPWG recommendations                           |
|                                                            |
+-----------------------------------------------------------+
```

**Warning Icon CSS:**

```css
.warning-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
}

.warning-icon--critical {
  background: #c62828;
  color: #ffffff;
}

.warning-icon--major {
  background: #d84315;
  color: #ffffff;
}

.warning-icon--moderate {
  background: #f9a825;
  color: #333333;
}

.warning-icon--info {
  background: #1565c0;
  color: #ffffff;
}

.warning-icon--guideline {
  background: #2e7d32;
  color: #ffffff;
}

/* Pattern overlay for colorblind accessibility */
.warning-icon--critical::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2px,
    rgba(255,255,255,0.3) 2px,
    rgba(255,255,255,0.3) 4px
  );
  border-radius: 50%;
}
```

---

## 8. Dashboard Components

### 8.1 Patient Genetics Summary

The patient genetics summary provides an **at-a-glance overview** of a patient's pharmacogenomic profile:

```
+-----------------------------------------------------------+
| PATIENT GENETICS SUMMARY PANEL                             |
+-----------------------------------------------------------+
|                                                            |
|  Patient: [Name]    DOB: [Date]    MRN: [ID]             |
|  Last Updated: [Date]    Report Version: [Version]        |
|                                                            |
|  +------------------+  +------------------+               |
|  | CYP2D6           |  | CYP2C19          |               |
|  | [PM]             |  | [IM]             |               |
|  | *4/*4            |  | *1/*2            |               |
|  | Score: 0.0       |  | Score: 0.5       |               |
|  | 12 drugs affected|  | 8 drugs affected |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | CYP2C9           |  | CYP3A4           |               |
|  | [NM]             |  | [NM]             |               |
|  | *1/*1            |  | *1/*1            |               |
|  | Score: 1.5       |  | Score: 2.0       |               |
|  | 3 drugs affected |  | 15 drugs affected|               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | CYP2B6           |  | CYP1A2           |               |
|  | [NM]             |  | [EM]             |               |
|  | *1/*1            |  | *1F/*1F          |               |
|  | Score: 1.5       |  | Inducible        |               |
|  | 5 drugs affected |  | 6 drugs affected |               |
|  +------------------+  +------------------+               |
|                                                            |
|  Key Alerts:                                               |
|  [!] CYP2D6 Poor Metabolizer - 12 medication warnings     |
|  [!] CYP2C19 Intermediate - Consider dose adjustments     |
|  [i] CYP1A2 Inducible - Smoking status affects metabolism |
|                                                            |
+-----------------------------------------------------------+
```

### 8.2 Gene Panel Overview

The gene panel overview displays **all tested genes** with their status:

```
+-----------------------------------------------------------+
| GENE PANEL OVERVIEW                                        |
+-----------------------------------------------------------+
|                                                            |
|  Pharmacokinetic Genes (CYP450):                          |
|  +--------+--------+--------+--------+--------+          |
|  | CYP2D6 | CYP2C19| CYP2C9 | CYP3A4 | CYP3A5 |          |
|  | [RED]  |[YELLOW]| [GREEN]| [GREEN]| [GREEN]|          |
|  | PM     | IM     | NM     | NM     | NM     |          |
|  +--------+--------+--------+--------+--------+          |
|  +--------+--------+                                       |
|  | CYP2B6 | CYP1A2 |                                       |
|  | [GREEN]| [BLUE] |                                       |
|  | NM     | EM     |                                       |
|  +--------+--------+                                       |
|                                                            |
|  Pharmacodynamic Genes:                                   |
|  +--------+--------+--------+--------+--------+          |
|  | SLC6A4 | HTR2A  | COMT   | DRD2   | ANK3   |          |
|  | [INFO] | [INFO] | [INFO] | [INFO] | [INFO] |          |
|  | L/L    | T/T    | Val/Met| Del/Wt | G/T    |          |
|  +--------+--------+--------+--------+--------+          |
|                                                            |
|  HLA Genes:                                               |
|  +--------------+--------------+                          |
|  | HLA-B*15:02  | HLA-A*31:01  |                          |
|  | [GREEN]      | [GREEN]      |                          |
|  | Negative     | Negative     |                          |
|  +--------------+--------------+                          |
|                                                            |
|  Nutrigenomics:                                           |
|  +--------+--------+                                       |
|  | MTHFR  | MTHFR  |                                       |
|  | C677T  | A1298C |                                       |
|  | [INFO] | [INFO] |                                       |
|  | C/T    | A/C    |                                       |
|  +--------+--------+                                       |
|                                                            |
+-----------------------------------------------------------+
```

### 8.3 Medication Interaction Table

The medication interaction table is the **primary clinical decision-support component**:

```
+-----------------------------------------------------------+
| MEDICATION INTERACTION TABLE                               |
+-----------------------------------------------------------+
|                                                            |
| [Search Medications...]  [Filter by Class v] [Filter v]   |
| [Show Only Interactions] [Sort by: Severity v]            |
|                                                            |
| +------------------------------------------------------+  |
| | Medication    | Class    | Severity | Genes | Action |  |
| +------------------------------------------------------+  |
| | Amitriptyline | TCA      | [RED]    | CYP2D6| Avoid  |  |
| |               |          | Major    | CYP2C19|       |  |
| +------------------------------------------------------+  |
| | Fluoxetine    | SSRI     | [YELLOW] | CYP2D6| Dose   |  |
| |               |          | Moderate | CYP2C19| Adj    |  |
| +------------------------------------------------------+  |
| | Escitalopram  | SSRI     | [GREEN]  | CYP2C19| Std   |  |
| |               |          | Normal   |       | Dose   |  |
| +------------------------------------------------------+  |
| | Sertraline    | SSRI     | [GREEN]  | CYP2C19| Std   |  |
| |               |          | Normal   |       | Dose   |  |
| +------------------------------------------------------+  |
| | ...                                                   |  |
| +------------------------------------------------------+  |
|                                                            |
| Showing 45 of 156 medications  [< 1 2 3 4 5 >]           |
|                                                            |
+-----------------------------------------------------------+
```

**Table Column Specifications:**

| Column | Required | Content | Width |
|---|---|---|---|
| **Medication Name** | Yes | Generic + brand names | 25% |
| **Drug Class** | Yes | ATC or custom classification | 12% |
| **Severity** | Yes | Color-coded badge (Green/Yellow/Red/Grey) | 10% |
| **Affected Genes** | Yes | Gene symbols with phenotype indicators | 18% |
| **Recommended Action** | Yes | Action text or badge | 15% |
| **Evidence** | Recommended | CPIC/FDA/DPWG badges | 10% |
| **Details** | Yes | Expand button or link | 10% |

### 8.4 Side Effect Risk Panel

The side effect risk panel identifies **genetically-influenced adverse drug reaction risks**:

```
+-----------------------------------------------------------+
| SIDE EFFECT RISK PANEL                                     |
+-----------------------------------------------------------+
|                                                            |
|  HLA-B*15:02 / Stevens-Johnson Syndrome                   |
|  +----------------------------------------------------+   |
|  | Status: NEGATIVE                                    |   |
|  | Risk: Standard population risk                      |   |
|  | Medications: Carbamazepine, Oxcarbazepine           |   |
|  | [GREEN - No special precautions needed]             |   |
|  +----------------------------------------------------+   |
|                                                            |
|  CYP2D6 Poor Metabolizer / Anticholinergic Effects        |
|  +----------------------------------------------------+   |
|  | Status: POOR METABOLIZER                            |   |
|  | Risk: ELEVATED - Anticholinergic side effects       |   |
|  | Medications: Paroxetine, TCAs                       |   |
|  | Action: Consider alternative or dose reduction      |   |
|  | [RED - Increased monitoring required]               |   |
|  +----------------------------------------------------+   |
|                                                            |
|  G6PD Deficiency / Hemolysis Risk                         |
|  +----------------------------------------------------+   |
|  | Status: NORMAL                                      |   |
|  | Risk: Standard population risk                      |   |
|  | [GREEN - No special precautions needed]             |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

### 8.5 Nutrigenomics Panel

The nutrigenomics panel displays **nutrition-related genetic variants**:

```
+-----------------------------------------------------------+
| NUTRIGENOMICS PANEL                                        |
+-----------------------------------------------------------+
|                                                            |
|  MTHFR C677T (rs1801133)                                  |
|  +----------------------------------------------------+   |
|  | Genotype: C/T (Heterozygous)                        |   |
|  | Enzyme Activity: ~65% of normal                      |   |
|  | Clinical Impact:                                     |   |
|  | - Elevated homocysteine possible                     |   |
|  | - Consider L-methylfolate supplementation            |   |
|  | - Monitor folate and B12 levels                      |   |
|  | [YELLOW - Moderate clinical relevance]              |   |
|  +----------------------------------------------------+   |
|                                                            |
|  MTHFR A1298C (rs1801131)                                 |
|  +----------------------------------------------------+   |
|  | Genotype: A/C (Heterozygous)                        |   |
|  | Enzyme Activity: ~85% of normal                      |   |
|  | Clinical Impact:                                     |   |
|  | - Mild impact on methylation                         |   |
|  | - Monitor in combination with C677T                  |   |
|  | [GREEN - Mild clinical relevance]                   |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Recommendations:                                          |
|  - Folate supplementation: L-methylfolate 7.5-15mg      |
|  - Vitamin B12: Ensure adequate levels                   |
|  - Vitamin B6: P-5-P form preferred                      |
|  - Homocysteine monitoring: Target <10 μmol/L            |
|                                                            |
+-----------------------------------------------------------+
```

### 8.6 Neuromodulation Panel

The neuromodulation panel displays **pharmacodynamic gene variants** relevant to psychiatric treatment:

```
+-----------------------------------------------------------+
| NEUROMODULATION PANEL                                      |
+-----------------------------------------------------------+
|                                                            |
|  Serotonin Transporter (SLC6A4)                           |
|  +----------------------------------------------------+   |
|  | 5-HTTLPR: Long/Long (L/L)                           |   |
|  | rs25531: G/G                                        |   |
|  | Function: Normal serotonin reuptake                  |   |
|  | Treatment Response: Standard SSRI response expected  |   |
|  | [GREEN]                                             |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Serotonin Receptor 2A (HTR2A)                            |
|  +----------------------------------------------------+   |
|  | rs7997012: T/T                                      |   |
|  | Function: Altered receptor density                   |   |
|  | Treatment Response: May affect antidepressant response|  |
|  | [YELLOW - Research evidence, not clinically actionable]|  |
|  +----------------------------------------------------+   |
|                                                            |
|  Dopamine D2 Receptor (DRD2)                              |
|  +----------------------------------------------------+   |
|  | rs1799732: Ins/Del                                  |   |
|  | Function: Modified D2 receptor expression            |   |
|  | Antipsychotic Response: May affect antipsychotic response|
|  | [YELLOW - Research evidence]                        |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Brain-Derived Neurotrophic Factor (BDNF)                 |
|  +----------------------------------------------------+   |
|  | rs6265: Val/Met                                     |   |
|  | Function: Reduced activity-dependent BDNF secretion    |
|  | Clinical Impact: May affect neuroplasticity          |   |
|  | [BLUE - Informational, research interest]            |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

### 8.7 Report Generation Button

```
+-----------------------------------------------------------+
| REPORT GENERATION COMPONENT                                |
+-----------------------------------------------------------+
|                                                            |
|  [Generate Full Report]    [Quick Summary]                |
|                                                            |
|  Report Options:                                           |
|  [x] Include medication interactions                       |
|  [x] Include gene details                                  |
|  [x] Include nutrigenomics                                 |
|  [ ] Include neuromodulation (research)                    |
|  [x] Include clinical guidelines                           |
|  [ ] Include family recommendations                        |
|                                                            |
|  Format:  (.) PDF   ( ) Interactive HTML   ( ) Both       |
|                                                            |
|  [Generate]  [Schedule]  [Cancel]                         |
|                                                            |
+-----------------------------------------------------------+
```

### 8.8 Export Options

```
+-----------------------------------------------------------+
| EXPORT OPTIONS COMPONENT                                   |
+-----------------------------------------------------------+
|                                                            |
|  Export Format:                                            |
|  +------------------+  +------------------+               |
|  | [PDF Icon]       |  | [HTML Icon]      |               |
|  | PDF Report       |  | Interactive HTML |               |
|  | Standard format  |  | With tooltips    |               |
|  | for printing     |  | and expand/coll  |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | [FHIR Icon]      |  | [JSON Icon]      |               |
|  | FHIR R4          |  | JSON Data        |               |
|  | Clinical record  |  | Machine readable |               |
|  | exchange         |  | for integration  |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | [CSV Icon]       |  | [Wallet Icon]    |               |
|  | CSV Spreadsheet  |  | Patient Card     |               |
|  | For analysis     |  | Wallet-sized     |               |
|  +------------------+  +------------------+               |
|                                                            |
|  Include in Export:                                        |
|  [x] Gene results        [x] Medication guidance         |
|  [x] Clinical notes      [x] Evidence levels             |
|  [ ] Raw genotype data   [ ] Methodology details          |
|                                                            |
|  [Export]  [Cancel]                                       |
|                                                            |
+-----------------------------------------------------------+
```

### 8.9 Audit Trail

```
+-----------------------------------------------------------+
| AUDIT TRAIL COMPONENT                                      |
+-----------------------------------------------------------+
|                                                            |
|  Report Access Log:                                        |
|  +----------------------------------------------------+   |
|  | Date/Time      | User        | Action    | IP       |   |
|  |----------------|-------------|-----------|----------|   |
|  | 2025-01-15 09:23 | Dr. Smith | Viewed    | 10.0.x.x |   |
|  | 2025-01-15 14:45 | Dr. Jones | Exported  | 10.0.x.x |   |
|  | 2025-01-16 08:12 | Dr. Smith | Generated | 10.0.x.x |   |
|  | 2025-01-16 10:30 | RN Lee    | Viewed    | 10.0.x.x |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Report Versions:                                          |
|  +----------------------------------------------------+   |
|  | Version | Date       | Changes                      |   |
|  |---------|------------|------------------------------|   |
|  | 1.0     | 2025-01-15 | Initial report               |   |
|  | 1.1     | 2025-01-16 | Updated CYP2D6 phenotype     |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Data Lineage:                                             |
|  Sample Collection -> DNA Extraction -> Genotyping ->      |
|  Phenotyping -> Clinical Annotation -> Report Generation   |
|                                                            |
|  [Download Full Audit Log]  [View Data Lineage]            |
|                                                            |
+-----------------------------------------------------------+
```

---

## 9. Color Scheme Standards

### 9.1 Primary Semantic Colors

| Semantic Meaning | Hex Code | RGB | Usage | Accessibility Contrast |
|---|---|---|---|---|
| **Green - Normal** | #4CAF50 | rgb(76,175,80) | Normal metabolizer, no action needed, use as directed | 4.5:1 on white |
| **Green Light** | #E8F5E9 | rgb(232,245,233) | Background tint for normal status | N/A (bg only) |
| **Yellow - Moderate** | #FF9800 | rgb(255,152,0) | Moderate interaction, caution, monitor | 3.0:1 on white |
| **Yellow Light** | #FFF3E0 | rgb(255,243,224) | Background tint for moderate status | N/A (bg only) |
| **Red - Significant** | #F44336 | rgb(244,67,54) | Significant interaction, avoid, major warning | 4.5:1 on white |
| **Red Light** | #FFEBEE | rgb(255,235,238) | Background tint for significant status | N/A (bg only) |
| **Grey - Unknown** | #9E9E9E | rgb(158,158,158) | Insufficient evidence, unknown, not tested | 3.0:1 on white |
| **Grey Light** | #F5F5F5 | rgb(245,245,245) | Background tint for unknown status | N/A (bg only) |
| **Blue - Informational** | #2196F3 | rgb(33,150,243) | Informational, research-only, ultrarapid | 4.5:1 on white |
| **Blue Light** | #E3F2FD | rgb(227,242,253) | Background tint for informational status | N/A (bg only) |
| **Amber - Warning** | #FFC107 | rgb(255,193,7) | Partial evidence, warning, needs attention | 2.0:1 on white |
| **Purple - Special** | #9C27B0 | rgb(156,39,176) | Ultrarapid metabolizer, special status | 4.5:1 on white |

### 9.2 Extended Color Palette

| Purpose | Color | Hex | Usage |
|---|---|---|---|
| **Critical Alert** | Dark Red | #C62828 | HLA hypersensitivity, DPYD deficiency |
| **Major Warning** | Deep Orange | #E65100 | Major gene-drug interactions |
| **Moderate Warning** | Amber | #FF8F00 | Moderate gene-drug interactions |
| **Normal/Standard** | Green | #2E7D32 | Normal metabolizer, standard dosing |
| **Enhanced Activity** | Blue | #1565C0 | Rapid metabolizer, increased activity |
| **Ultrarapid** | Purple | #7B1FA2 | Ultrarapid metabolizer |
| **Inducible** | Teal | #00695C | CYP1A2 inducible phenotype |
| **Informational** | Light Blue | #0277BD | Research-only, informational genes |
| **Neutral/Default** | Grey | #616161 | Not applicable, no data |
| **Success/Confirmed** | Emerald | #1B5E20 | Positive confirmation, guideline match |

### 9.3 Metabolizer-Specific Color Mapping

```
+-----------------------------------------------------------+
| METABOLIZER STATUS COLOR MAP                               |
+-----------------------------------------------------------+
|                                                            |
|  Ultrarapid Metabolizer (UM)                               |
|  +----------------------------------------------------+   |
|  | Background: #F3E5F5    Text: #7B1FA2               |   |
|  | Border: #CE93D8          Badge: Purple              |   |
|  | Gauge: Purple zone                                   |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Rapid Metabolizer (RM) / Extensive Normal (EM)            |
|  +----------------------------------------------------+   |
|  | Background: #E3F2FD    Text: #1565C0               |   |
|  | Border: #90CAF9          Badge: Blue                |   |
|  | Gauge: Blue zone                                     |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Normal Metabolizer (NM)                                   |
|  +----------------------------------------------------+   |
|  | Background: #E8F5E9    Text: #2E7D32               |   |
|  | Border: #A5D6A7          Badge: Green               |   |
|  | Gauge: Green zone                                    |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Intermediate Metabolizer (IM)                             |
|  +----------------------------------------------------+   |
|  | Background: #FFF3E0    Text: #EF6C00               |   |
|  | Border: #FFCC80          Badge: Orange              |   |
|  | Gauge: Orange zone                                   |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Poor Metabolizer (PM)                                     |
|  +----------------------------------------------------+   |
|  | Background: #FFEBEE    Text: #C62828               |   |
|  | Border: #EF9A9A          Badge: Red                 |   |
|  | Gauge: Red zone                                      |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Indeterminate / Unknown                                   |
|  +----------------------------------------------------+   |
|  | Background: #F5F5F5    Text: #9E9E9E               |   |
|  | Border: #E0E0E0          Badge: Grey                |   |
|  | Gauge: Grey zone                                     |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

### 9.4 Gene-Drug Interaction Severity Color Map

| Severity Level | Background | Text | Border | Icon |
|---|---|---|---|---|
| **Use as Directed / No Interaction** | #E8F5E9 | #2E7D32 | #A5D6A7 | Green checkmark |
| **Minimal Interaction** | #F1F8E9 | #558B2F | #C5E1A5 | Light green dot |
| **Moderate Interaction** | #FFF3E0 | #E65100 | #FFCC80 | Yellow triangle |
| **Major Interaction** | #FFEBEE | #C62828 | #EF9A9A | Red octagon |
| **Critical / Avoid** | #FFEBEE | #B71C1C | #EF5350 | Red exclamation |
| **Insufficient Evidence** | #F5F5F5 | #616161 | #E0E0E0 | Grey question |
| **Research Only** | #E3F2FD | #1565C0 | #90CAF9 | Blue info circle |

### 9.5 Color Combination Rules

```css
/* Root CSS Variables for Pharmacogenomics Color System */
:root {
  /* Primary semantic colors */
  --pgx-normal: #4CAF50;
  --pgx-normal-light: #E8F5E9;
  --pgx-normal-dark: #2E7D32;
  
  --pgx-moderate: #FF9800;
  --pgx-moderate-light: #FFF3E0;
  --pgx-moderate-dark: #E65100;
  
  --pgx-significant: #F44336;
  --pgx-significant-light: #FFEBEE;
  --pgx-significant-dark: #C62828;
  
  --pgx-unknown: #9E9E9E;
  --pgx-unknown-light: #F5F5F5;
  --pgx-unknown-dark: #616161;
  
  --pgx-informational: #2196F3;
  --pgx-informational-light: #E3F2FD;
  --pgx-informational-dark: #1565C0;
  
  --pgx-warning: #FFC107;
  --pgx-warning-light: #FFF8E1;
  --pgx-warning-dark: #FF8F00;
  
  /* Metabolizer-specific colors */
  --pgx-ultrarapid: #9C27B0;
  --pgx-ultrarapid-light: #F3E5F5;
  --pgx-rapid: #2196F3;
  --pgx-rapid-light: #E3F2FD;
  --pgx-intermediate: #FF9800;
  --pgx-intermediate-light: #FFF3E0;
  --pgx-poor: #F44336;
  --pgx-poor-light: #FFEBEE;
  --pgx-inducible: #009688;
  --pgx-inducible-light: #E0F2F1;
  
  /* HLA / Critical colors */
  --pgx-critical: #C62828;
  --pgx-critical-light: #FFEBEE;
  --pgx-hla-positive: #F44336;
  --pgx-hla-negative: #4CAF50;
}

/* Usage patterns */
.gene-card--poor {
  background: var(--pgx-poor-light);
  border-color: var(--pgx-poor);
  color: var(--pgx-poor-dark);
}

.gene-card--intermediate {
  background: var(--pgx-intermediate-light);
  border-color: var(--pgx-intermediate);
  color: var(--pgx-intermediate-dark);
}

.gene-card--normal {
  background: var(--pgx-normal-light);
  border-color: var(--pgx-normal);
  color: var(--pgx-normal-dark);
}

.medication-row--major {
  background: var(--pgx-significant-light);
  border-left: 4px solid var(--pgx-significant);
}

.medication-row--moderate {
  background: var(--pgx-moderate-light);
  border-left: 4px solid var(--pgx-moderate);
}

.medication-row--normal {
  background: var(--pgx-normal-light);
  border-left: 4px solid var(--pgx-normal);
}
```

### 9.6 Dark Mode Color Adaptations

```css
@media (prefers-color-scheme: dark) {
  :root {
    --pgx-normal-light: #1B5E20;
    --pgx-normal: #66BB6A;
    --pgx-normal-dark: #A5D6A7;
    
    --pgx-moderate-light: #E65100;
    --pgx-moderate: #FFB74D;
    --pgx-moderate-dark: #FFE0B2;
    
    --pgx-significant-light: #B71C1C;
    --pgx-significant: #EF5350;
    --pgx-significant-dark: #FFCDD2;
    
    --pgx-unknown-light: #424242;
    --pgx-unknown: #BDBDBD;
    --pgx-unknown-dark: #E0E0E0;
    
    --pgx-informational-light: #0D47A1;
    --pgx-informational: #64B5F6;
    --pgx-informational-dark: #BBDEFB;
  }
  
  .gene-card {
    background: #1E1E1E;
    border-color: #424242;
  }
  
  .medication-matrix__row-header {
    background: #2D2D2D;
    color: #E0E0E0;
  }
}
```

---

## 10. Interaction Patterns

### 10.1 Gene Click -> Detail Modal

When a user clicks on a gene card or gene name, a **detail modal** opens with comprehensive information:

```
+-----------------------------------------------------------+
| Gene Detail Modal - CYP2D6                     [X] Close  |
+-----------------------------------------------------------+
|                                                            |
|  CYP2D6 - Cytochrome P450 2D6                    [PM]     |
|  ==================================================       |
|                                                            |
|  GENOTYPE & PHENOTYPE                                      |
|  Genotype: *4/*4                                          |
|  Activity Score: 0.0                                      |
|  Phenotype: Poor Metabolizer                              |
|  Allele 1: *4 (No Function, 1846G>A, splicing defect)     |
|  Allele 2: *4 (No Function, 1846G>A, splicing defect)     |
|  Copy Number: 2 (Normal)                                  |
|                                                            |
|  +----------------------------------------------------+   |
|  | CPIC LEVEL A GUIDELINE                             |   |
|  | This gene-drug interaction has strong evidence     |   |
|  | and is considered actionable.                      |   |
|  +----------------------------------------------------+   |
|                                                            |
|  AFFECTED MEDICATIONS (12)                                 |
|  +----------------------------------------------------+   |
|  | [RED] Amitriptyline - Avoid standard dose          |   |
|  | [RED] Nortriptyline - Reduce dose to 50%           |   |
|  | [RED] Codeine - Avoid (no morphine production)     |   |
|  | [RED] Paroxetine - Consider alternative            |   |
|  | [YELLOW] Fluoxetine - Reduced dose recommended     |   |
|  | ... 7 more medications                               |   |
|  +----------------------------------------------------+   |
|                                                            |
|  CLINICAL GUIDELINES                                       |
|  [CPIC Guidelines] [FDA Table] [PharmGKB] [DPWG]          |
|                                                            |
|  +----------------------------------------------------+   |
|  | EVIDENCE SUMMARY                                     |   |
|  | Activity Score 0.0: Little to no enzyme activity.   |   |
|  | Standard doses may cause toxicity or lack of         |   |
|  | efficacy for prodrugs. Dose reduction or alternative |
|  | therapy recommended for affected medications.        |   |
|  +----------------------------------------------------+   |
|                                                            |
|  [Copy Genotype]  [View Full Guidelines]  [Print]          |
|                                                            |
+-----------------------------------------------------------+
```

**Interaction Specifications:**

| Trigger | Action | Animation | Duration |
|---|---|---|---|
| **Click** on gene card | Open detail modal | Fade in + scale up from origin | 200ms |
| **Click** close button | Close modal | Fade out + scale down | 150ms |
| **Click** outside modal | Close modal | Fade out | 150ms |
| **Press Escape** | Close modal | Fade out | 150ms |
| **Click** "Copy Genotype" | Copy to clipboard | Brief checkmark flash | 300ms |
| **Click** medication | Navigate to drug detail | Slide transition | 250ms |

### 10.2 Medication Hover -> Interaction Tooltip

Hovering over a medication row or cell displays a **tooltip** with interaction details:

```
+-----------------------------------------------------------+
| Medication Row (hover state):                              |
|                                                            |
|  +----------------------------------------------------+   |
|  | Fluoxetine (Prozac) [SSRI]               [YELLOW]  |   |
|  +----------------------------------------------------+   |
|       |                                                    |
|       v  (on hover)                                        |
|  +----------------------------------------------------+   |
|  | TOOLTIP                                             |   |
|  |                                                     |   |
|  | Fluoxetine + CYP2D6 Poor Metabolizer                |   |
|  | Severity: MODERATE                                  |   |
|  |                                                     |   |
|  | Effect: Reduced metabolism of fluoxetine            |   |
|  | predicted. Increased exposure to fluoxetine         |   |
|  | and active metabolite norfluoxetine.                |   |
|  |                                                     |   |
|  | Recommendation: Consider 50% dose reduction or      |   |
|  | alternative SSRI (e.g., sertraline).                |   |
|  |                                                     |   |
|  | Evidence: CPIC Level A | FDA Label                  |   |
|  |                                                     |   |
|  | Affected Pathway: CYP2D6 (primary)                  |   |
|  |                                                    |   |
|  | [View Full Details] [CPIC Guideline]                |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

**Tooltip Specifications:**

| Property | Value | Rationale |
|---|---|---|
| **Trigger** | Mouse hover (desktop), Tap (mobile) | Contextual information on demand |
| **Delay** | 300ms hover delay | Prevent accidental triggers |
| **Position** | Auto (top/bottom/left/right based on viewport) | Always visible |
| **Max Width** | 360px | Readable line length |
| **Background** | #FFFFFF with subtle shadow | Visibility and depth |
| **Border** | 1px solid #E0E0E0 | Definition |
| **Pointer** | 8px triangle pointing to trigger element | Clear association |
| **Dismiss** | Mouse leave, Escape key, click outside | Natural dismissal |
| **Animation** | Fade in 150ms, slight translate Y (-4px) | Smooth appearance |

### 10.3 Report Expand -> Full Evidence

Clicking an expand button reveals **full clinical evidence**:

```
+-----------------------------------------------------------+
| EXPANDABLE EVIDENCE SECTION                                |
|                                                            |
|  Escitalopram (Lexapro)                           [GREEN]  |
|  +----------------------------------------------------+   |
|  | Severity: Normal metabolism expected               |   |
|  | Genes: CYP2C19                                     |   |
|  |                                                    |   |
|  | [Show Evidence] [Show Guidelines]                  |   |
|  +----------------------------------------------------+   |
|       |                                                    |
|       v  (after expand)                                    |
|  +----------------------------------------------------+   |
|  | EVIDENCE DETAILS                                     |   |
|  |                                                      |   |
|  | Patient Genotype: CYP2C19 *1/*1 (Normal Metabolizer) |   |
|  |                                                      |   |
|  | Escitalopram is primarily metabolized by CYP2C19.   |   |
|  | Normal CYP2C19 activity is expected to result in    |   |
|  | standard metabolism of escitalopram. No dose        |   |
|  | adjustment needed based on CYP2C19 genotype.        |   |
|  |                                                      |   |
|  | Supporting Evidence:                                 |   |
|  | - CPIC Guideline for CYP2C19 and SSRIs (Level A)    |   |
|  | - FDA Table of Pharmacogenetic Associations          |   |
|  | - 12 peer-reviewed publications                      |   |
|  |                                                      |   |
|  | References:                                          |   |
|  | 1. Hicks et al. (2015) CPIC Guideline...            |   |
|  | 2. FDA Table of Pharmacogenetic Associations...     |   |
|  | 3. PharmGKB Clinical Annotation...                  |   |
|  |                                                      |   |
|  | [Collapse] [View All References]                     |   |
|  +----------------------------------------------------+   |
|                                                            |
+-----------------------------------------------------------+
```

**Expand/Collapse Animation:**

```css
.evidence-section {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
  opacity: 0;
}

.evidence-section--expanded {
  max-height: 1000px; /* Adjust based on content */
  opacity: 1;
}

.evidence-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1976d2;
  font-size: 13px;
}

.evidence-toggle::after {
  content: '▼';
  font-size: 10px;
  transition: transform 0.2s ease;
}

.evidence-toggle--expanded::after {
  transform: rotate(180deg);
}
```

### 10.4 Filter by Drug Class

The drug class filter allows users to **narrow medication lists** by therapeutic category:

```
+-----------------------------------------------------------+
| DRUG CLASS FILTER COMPONENT                                |
+-----------------------------------------------------------+
|                                                            |
|  Filter by Drug Class:                                     |
|  [All Classes] [Antidepressants] [Antipsychotics]         |
|  [Anxiolytics] [Mood Stabilizers] [Stimulants]            |
|  [Cardiovascular] [Pain Management] [Gastroenterology]    |
|  [Infectious Disease] [Immunosuppression] [Oncology]      |
|  [Allergy] [Endocrinology] [Neurology] [Urology]          |
|                                                            |
|  Active Filters: [Antidepressants x] [Moderate+ x]        |
|                                                            |
|  Sub-filters (for Antidepressants):                        |
|  [All] [SSRIs] [SNRIs] [TCAs] [MAOIs] [Atypical]          |
|                                                            |
+-----------------------------------------------------------+
```

**Filter Interaction Pattern:**

1. **Click** drug class pill -> Filter medication list instantly
2. **Multi-select** -> Hold Ctrl/Cmd for multiple classes
3. **Sub-filter** -> Appears when parent class selected
4. **Active filter chips** -> Show below filter bar with X to remove
5. **Clear all** -> "All Classes" resets all filters
6. **URL sync** -> Filters reflected in URL for sharing/bookmarking

```css
.drug-class-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}

.drug-class-pill {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid #e0e0e0;
  background: #ffffff;
  color: #616161;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drug-class-pill:hover {
  background: #f5f5f5;
  border-color: #bdbdbd;
}

.drug-class-pill--active {
  background: #1976d2;
  color: #ffffff;
  border-color: #1976d2;
}

.drug-class-pill--active:hover {
  background: #1565c0;
}

.active-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 16px;
  background: #e3f2fd;
  color: #1565c0;
  font-size: 12px;
}

.active-filter-chip__remove {
  cursor: pointer;
  font-weight: 700;
  margin-left: 4px;
}
```

### 10.5 Filter by Gene

The gene filter allows users to **view medications affected by specific genes**:

```
+-----------------------------------------------------------+
| GENE FILTER COMPONENT                                      |
+-----------------------------------------------------------+
|                                                            |
|  Filter by Gene:                                           |
|  +------------------+  +------------------+               |
|  | [x] CYP2D6      |  | [ ] CYP2C19     |               |
|  | (12 medications) |  | (8 medications)  |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | [ ] CYP2C9      |  | [ ] CYP3A4      |               |
|  | (3 medications)  |  | (15 medications) |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | [ ] CYP2B6      |  | [ ] CYP1A2      |               |
|  | (5 medications)  |  | (6 medications)  |               |
|  +------------------+  +------------------+               |
|                                                            |
|  Gene Interaction Mode:                                    |
|  (o) ANY selected gene    ( ) ALL selected genes          |
|                                                            |
+-----------------------------------------------------------+
```

### 10.6 Search Medications

The medication search component provides **real-time search** with autocomplete:

```
+-----------------------------------------------------------+
| MEDICATION SEARCH COMPONENT                                |
+-----------------------------------------------------------+
|                                                            |
|  [Search medications...                           ] [Q]   |
|                                                            |
|  Suggestions (as user types):                              |
|  +----------------------------------------------------+   |
|  | fluoxetine (Prozac) - SSRI - [YELLOW]              |   |
|  | fluvoxamine (Luvox) - SSRI - [YELLOW]              |   |
|  | flurazepam (Dalmane) - Benzodiazepine - [GREEN]    |   |
|  +----------------------------------------------------+   |
|                                                            |
|  Recent Searches:                                          |
|  [Fluoxetine] [Sertraline] [Carbamazepine] [Clear]        |
|                                                            |
+-----------------------------------------------------------+
```

**Search Specifications:**

| Feature | Behavior | Implementation |
|---|---|---|
| **Debounce** | 300ms delay before search | Prevents excessive API calls |
| **Fuzzy matching** | Matches generic and brand names | Levenshtein distance <= 2 |
| **Autocomplete** | Shows top 5 matches | Ranked by relevance |
| **Highlighting** | Matching text bolded | `<mark>` tag styling |
| **Keyboard nav** | Up/down arrows, Enter to select | Accessible navigation |
| **Recent searches** | Shows last 5 searches | Local storage persistence |
| **Clear button** | Appears when input has text | One-click clear |

```css
.medication-search {
  position: relative;
  width: 100%;
  max-width: 480px;
}

.medication-search__input {
  width: 100%;
  padding: 10px 40px 10px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.medication-search__input:focus {
  outline: none;
  border-color: #1976d2;
}

.medication-search__suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-top: none;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.medication-search__suggestion {
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.1s ease;
}

.medication-search__suggestion:hover,
.medication-search__suggestion--highlighted {
  background: #f5f5f5;
}

.medication-search__suggestion mark {
  background: #fff3e0;
  color: #e65100;
  font-weight: 600;
}
```

### 10.7 Sort by Evidence Level

Medications can be **sorted by evidence level** to prioritize clinically actionable results:

```
+-----------------------------------------------------------+
| SORT COMPONENT                                             |
+-----------------------------------------------------------+
|                                                            |
|  Sort by: [Evidence Level v]  [Drug Name ^]  [Severity v]  |
|                                                            |
|  Evidence Level Sort Order:                                |
|  1. CPIC Level A (Strongest)                               |
|  2. CPIC Level B                                           |
|  3. FDA Pharmacogenetic Table                              |
|  4. CPIC Level C                                           |
|  5. CPIC Level D                                           |
|  6. Research Evidence Only                                 |
|                                                            |
|  Within same evidence level:                               |
|  - Severity (Critical > Major > Moderate > Minimal)        |
|  - Alphabetical by generic name                            |
|                                                            |
+-----------------------------------------------------------+
```

---

## 11. Mobile Considerations

### 11.1 Responsive Gene Cards

Gene cards must **adapt to smaller screens** while preserving information hierarchy:

```
DESKTOP (1024px+)
+-----------------------------------------------------------+
| +------------------+  +------------------+                 |
| | CYP2D6     [PM]  |  | CYP2C19    [IM]  |                 |
| | *4/*4            |  | *1/*2            |                 |
| | Score: 0.0       |  | Score: 0.5       |                 |
| | 12 drugs         |  | 8 drugs          |                 |
| +------------------+  +------------------+                 |
+-----------------------------------------------------------+

TABLET (768px-1023px)
+--------------------------------------+
| +------------------+------------------+ |
| | CYP2D6     [PM]  | CYP2C19    [IM]  | |
| | *4/*4            | *1/*2            | |
| | Score: 0.0       | Score: 0.5       | |
| +------------------+------------------+ |
+--------------------------------------+

MOBILE (<768px)
+--------------------------+
| +----------------------+ |
| | CYP2D6         [PM]  | |
| | *4/*4   Score: 0.0   | |
| | 12 drugs affected    | |
| | [View Details >]     | |
| +----------------------+ |
| +----------------------+ |
| | CYP2C19        [IM]  | |
| | *1/*2   Score: 0.5   | |
| | 8 drugs affected     | |
| | [View Details >]     | |
| +----------------------+ |
+--------------------------+
```

**Responsive Breakpoints:**

| Breakpoint | Layout | Gene Cards Per Row |
|---|---|---|
| **Mobile** (< 768px) | Single column stack | 1 |
| **Tablet** (768-1023px) | 2-column grid | 2 |
| **Desktop** (1024-1439px) | 3-column grid | 3 |
| **Large Desktop** (1440px+) | 4-column grid | 4 |

**CSS Implementation:**

```css
.gene-cards-grid {
  display: grid;
  gap: 16px;
  padding: 16px;
}

/* Mobile: 1 column */
.gene-cards-grid {
  grid-template-columns: 1fr;
}

/* Tablet: 2 columns */
@media (min-width: 768px) {
  .gene-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 3 columns */
@media (min-width: 1024px) {
  .gene-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Large Desktop: 4 columns */
@media (min-width: 1440px) {
  .gene-cards-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Mobile gene card adjustments */
@media (max-width: 767px) {
  .gene-card {
    padding: 12px;
  }
  
  .gene-card__header {
    flex-direction: row;
    flex-wrap: wrap;
  }
  
  .gene-card__symbol {
    font-size: 16px;
  }
  
  .gene-card__phenotype-badge {
    font-size: 11px;
    padding: 3px 10px;
  }
  
  .gene-card__clinical-impact {
    font-size: 12px;
    padding: 8px;
  }
  
  /* Hide less critical info on mobile */
  .gene-card__allele-function {
    display: none;
  }
  
  /* Show on expand */
  .gene-card--expanded .gene-card__allele-function {
    display: block;
  }
}
```

### 11.2 Swipeable Medication List

On mobile, the medication list becomes **horizontally swipeable**:

```
+--------------------------+
| Medications (swipe ->)   |
|                          |
| +----------------------+ |
| | [RED]               | |
| | Amitriptyline       | |
| | Major interaction   | |
| | CYP2D6, CYP2C19     | |
| +----------------------+ |
|                          |
| +----------------------+ |
| |[YELLOW]             | |
| | Fluoxetine          | |
| | Moderate            | |
| | CYP2D6              | |
| +----------------------+ |
|                          |
| (2 of 45)                |
+--------------------------+
```

**Swipe Implementation:**

```css
.medication-list--mobile {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
  gap: 12px;
  padding: 12px;
}

.medication-list--mobile::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.medication-card--mobile {
  flex: 0 0 85%; /* Show partial next card */
  scroll-snap-align: start;
  min-height: 140px;
}

/* Swipe indicator dots */
.swipe-indicator {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 8px;
}

.swipe-indicator__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e0e0e0;
  transition: background 0.2s ease;
}

.swipe-indicator__dot--active {
  background: #1976d2;
  width: 20px;
  border-radius: 4px;
}
```

### 11.3 Collapsible Sections

On mobile, report sections are **collapsed by default** to reduce scrolling:

```
+--------------------------+
| > Gene Results (6 genes) |
|                          |
| > Medications (45)       |
|                          |
| > Side Effect Risks (3)  |
|                          |
| > Nutrigenomics          |
|                          |
| > Neuromodulation        |
|                          |
| v Audit Trail            |
| - Viewed by Dr. Smith    |
| - Exported by RN Jones   |
|                          |
+--------------------------+
```

**Collapsible Section CSS:**

```css
.collapsible-section {
  border-bottom: 1px solid #e0e0e0;
}

.collapsible-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  background: #ffffff;
  transition: background 0.15s ease;
}

.collapsible-section__header:active {
  background: #f5f5f5;
}

.collapsible-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.collapsible-section__count {
  font-size: 13px;
  color: #9e9e9e;
  margin-left: 8px;
}

.collapsible-section__chevron {
  font-size: 12px;
  color: #9e9e9e;
  transition: transform 0.2s ease;
}

.collapsible-section--expanded .collapsible-section__chevron {
  transform: rotate(180deg);
}

.collapsible-section__content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  background: #fafafa;
}

.collapsible-section--expanded .collapsible-section__content {
  max-height: 2000px; /* Large enough for content */
  transition: max-height 0.4s ease-in;
}

.collapsible-section__inner {
  padding: 12px 16px;
}
```

### 11.4 Touch-Friendly Buttons

All interactive elements must meet **minimum touch target sizes**:

| Element | Minimum Size | Recommended Size | Touch Padding |
|---|---|---|---|
| **Primary Button** | 44×44px | 48×48px | 8px |
| **Secondary Button** | 44×44px | 44×44px | 8px |
| **Icon Button** | 44×44px | 48×48px | 12px |
| **Checkbox/Radio** | 44×44px | 44×44px | 8px |
| **List Item** | 44px height | 56px height | 12px horizontal |
| **Tab** | 44px height | 48px height | 16px horizontal |
| **Pill/Chip** | 32px height | 36px height | 12px horizontal |
| **Card** | 100% width | - | 16px |

```css
/* Touch-friendly button base */
.btn {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  transition: all 0.15s ease;
}

.btn--primary {
  background: #1976d2;
  color: #ffffff;
}

.btn--primary:active {
  background: #1565c0;
  transform: scale(0.98);
}

.btn--secondary {
  background: #f5f5f5;
  color: #424242;
  border: 1px solid #e0e0e0;
}

.btn--icon {
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 50%;
}

/* Prevent double-tap zoom on mobile */
@media (pointer: coarse) {
  .btn,
  .gene-card,
  .medication-row,
  .collapsible-section__header {
    touch-action: manipulation;
  }
}
```

### 11.5 Mobile-First Report Layout

```
MOBILE REPORT LAYOUT
+--------------------------+
| [Menu] Report   [Share]  |
+--------------------------+
| PATIENT SUMMARY          |
| Name: [Patient]          |
| DOB: [Date]  MRN: [ID]   |
| Test: [Date]  Ver: [V]   |
+--------------------------+
| KEY ALERTS               |
| [!] CYP2D6 PM (12 drugs) |
| [!] CYP2C19 IM (8 drugs) |
+--------------------------+
| QUICK ACTIONS            |
| [Full Report] [Meds] [Genes]
+--------------------------+
| v CYP450 GENES (6)       |
| CYP2D6 [PM] *4/*4        |
| CYP2C19 [IM] *1/*2       |
| ... (tap for details)    |
+--------------------------+
| v MEDICATIONS (45)       |
| [Search...]              |
| [All v] [Severity v]     |
| [RED] Amitriptyline      |
| [YELLOW] Fluoxetine      |
| [GREEN] Sertraline       |
| ...                      |
+--------------------------+
| v NUTRIGENOMICS          |
| MTHFR C677T: C/T         |
| Recommendation: L-methyl |
+--------------------------+
| FOOTER                   |
| Generated: [Date]        |
| Lab: [CLIA] [CAP]        |
| [Disclaimer]             |
+--------------------------+
```

---

## 12. Accessibility

### 12.1 Color-Blind Friendly Design

**Problem:** The standard red-yellow-green color scheme is problematic for the ~8% of males and ~0.5% of females with color vision deficiency (CVD).

**Solution:** Use **patterns + color** as redundant encoding:

```
+-----------------------------------------------------------+
| COLOR-BLIND ACCESSIBLE INDICATORS                          |
|                                                            |
| Without CVD:              With CVD (Deuteranopia):         |
|  [GREEN solid] Normal      [Green-tone solid] Normal       |
|  [YELLOW striped] Caution  [Yellow-tone striped] Caution   |
|  [RED dotted] Warning      [Red-tone dotted] Warning       |
|  [GREY blank] Unknown      [Grey blank] Unknown            |
|                                                            |
| Pattern Legend:                                            |
|  Normal:     Solid fill (no pattern)                       |
|  Moderate:   Horizontal stripes (===)                      |
|  Significant: Diagonal crosshatch (XXX)                    |
|  Critical:   Vertical bars (|||)                           |
|  Unknown:    Dots (...)                                    |
|  Info:       Diamonds                                      |
|                                                            |
+-----------------------------------------------------------+
```

**CSS Pattern Implementation:**

```css
/* Base pattern classes for color-blind accessibility */
.pgx-pattern--normal {
  /* Solid fill - no pattern needed */
}

.pgx-pattern--moderate {
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 4px,
    rgba(0,0,0,0.08) 4px,
    rgba(0,0,0,0.08) 8px
  );
}

.pgx-pattern--significant {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(0,0,0,0.1) 4px,
    rgba(0,0,0,0.1) 8px
  ),
  repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 4px,
    rgba(0,0,0,0.1) 4px,
    rgba(0,0,0,0.1) 8px
  );
}

.pgx-pattern--critical {
  background-image: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.12) 3px,
    rgba(0,0,0,0.12) 6px
  );
}

.pgx-pattern--unknown {
  background-image: radial-gradient(
    circle,
    rgba(0,0,0,0.08) 1px,
    transparent 1px
  );
  background-size: 6px 6px;
}

/* SVG-based pattern fallback for better control */
.pgx-pattern-svg--moderate {
  background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 4h8' stroke='rgba(0,0,0,0.1)' stroke-width='1'/%3E%3C/svg%3E");
}

.pgx-pattern-svg--significant {
  background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l8 8M8 0l-8 8' stroke='rgba(0,0,0,0.12)' stroke-width='1'/%3E%3C/svg%3E");
}
```

**Color-Blind Safe Palette:**

| Status | Color | Hex | Pattern | Also Distinguishable By |
|---|---|---|---|---|
| **Normal** | Teal-Green | #00897B | Solid | Checkmark icon |
| **Moderate** | Orange | #F57C00 | Horizontal stripes | Warning triangle icon |
| **Significant** | Magenta-Red | #C2185B | Crosshatch | Octagon stop icon |
| **Critical** | Dark Purple | #4527A0 | Vertical bars | Skull/X icon |
| **Unknown** | Grey | #757575 | Dots | Question mark icon |
| **Info** | Blue | #1565C0 | Diamonds | Info circle icon |

### 12.2 Screen Reader Support

**ARIA Attributes for Gene Cards:**

```html
<div class="gene-card" role="region" aria-label="CYP2D6 gene result">
  <div class="gene-card__header">
    <span class="gene-card__symbol" role="heading" aria-level="3">
      CYP2D6
    </span>
    <span class="gene-card__phenotype-badge" 
          role="status" 
          aria-label="Poor Metabolizer">
      PM
    </span>
  </div>
  <div class="gene-card__genotype" aria-label="Genotype">
    <span aria-label="Star allele 4 on chromosome 1">*4</span>
    <span aria-hidden="true">/</span>
    <span aria-label="Star allele 4 on chromosome 2">*4</span>
  </div>
  <div class="gene-card__clinical-impact" role="note">
    <p>Poor Metabolizer status indicates little to no enzyme activity. 
       Standard doses of affected medications may cause toxicity.</p>
  </div>
  <button class="gene-card__details-btn" 
          aria-expanded="false"
          aria-controls="cyp2d6-details"
          aria-label="View CYP2D6 medication details">
    View 12 affected medications
  </button>
  <div id="cyp2d6-details" class="gene-card__details" hidden>
    <!-- Medication list -->
  </div>
</div>
```

**ARIA Attributes for Medication Matrix:**

```html
<table class="medication-matrix" 
       role="table" 
       aria-label="Gene-drug interaction matrix">
  <thead role="rowgroup">
    <tr role="row">
      <th role="columnheader" scope="col">Medication</th>
      <th role="columnheader" scope="col" aria-label="CYP2D6 gene">
        CYP2D6
      </th>
      <!-- ... -->
    </tr>
  </thead>
  <tbody role="rowgroup">
    <tr role="row" aria-label="Fluoxetine medication row">
      <th role="rowheader" scope="row">Fluoxetine</th>
      <td role="cell" 
          aria-label="CYP2D6: Poor Metabolizer interaction"
          class="medication-matrix__cell--poor">
        PM
      </td>
      <!-- ... -->
    </tr>
  </tbody>
</table>
```

**Live Regions for Dynamic Content:**

```html
<!-- Status announcements -->
<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
  12 medications filtered. Showing 8 with moderate or higher severity.
</div>

<!-- Alert announcements -->
<div role="alert" aria-live="assertive" aria-atomic="true" class="sr-only">
  Warning: CYP2D6 Poor Metabolizer detected. 12 medications affected.
</div>
```

### 12.3 Keyboard Navigation

**Navigation Map:**

| Key | Action | Context |
|---|---|---|
| **Tab** | Move to next focusable element | Global |
| **Shift+Tab** | Move to previous focusable element | Global |
| **Enter** | Activate button/link, expand/collapse | Buttons, links, sections |
| **Space** | Toggle checkbox, activate button | Form controls |
| **Arrow Down** | Next item in list/grid | Lists, tables, gene cards |
| **Arrow Up** | Previous item in list/grid | Lists, tables, gene cards |
| **Arrow Right** | Next column in table | Medication matrix |
| **Arrow Left** | Previous column in table | Medication matrix |
| **Home** | First item in list | Lists, tables |
| **End** | Last item in list | Lists, tables |
| **Escape** | Close modal, dismiss tooltip | Modals, tooltips, dropdowns |
| **Page Down** | Scroll down one viewport | Long reports |
| **Page Up** | Scroll up one viewport | Long reports |

**Focus Management:**

```css
/* Visible focus indicator */
:focus-visible {
  outline: 3px solid #1976d2;
  outline-offset: 2px;
  border-radius: 2px;
}

/* Focus trap for modals */
.modal--open {
  /* Modal receives focus on open */
}

/* Skip link for keyboard users */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #1976d2;
  color: #ffffff;
  padding: 8px 16px;
  z-index: 1000;
  transition: top 0.2s ease;
}

.skip-link:focus {
  top: 0;
}

/* Gene card keyboard navigation */
.gene-card {
  cursor: pointer;
}

.gene-card:focus-visible {
  outline: 3px solid #1976d2;
  outline-offset: 4px;
  box-shadow: 0 0 0 6px rgba(25, 118, 210, 0.15);
}

/* Medication row keyboard navigation */
.medication-row:focus-visible {
  background: #e3f2fd;
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

/* Tab navigation for filter pills */
.drug-class-pill:focus-visible {
  outline: 2px solid #1976d2;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.1);
}
```

**Focus Trap for Modals:**

```javascript
// Focus trap implementation for detail modals
class FocusTrap {
  constructor(element) {
    this.element = element;
    this.focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    this.firstFocusable = this.focusableElements[0];
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
  }

  trap(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === this.firstFocusable) {
        e.preventDefault();
        this.lastFocusable.focus();
      } else if (!e.shiftKey && document.activeElement === this.lastFocusable) {
        e.preventDefault();
        this.firstFocusable.focus();
      }
    }
  }
}
```

### 12.4 High Contrast Mode

**Windows High Contrast Mode Support:**

```css
@media (forced-colors: active) {
  /* Override all color schemes */
  .gene-card,
  .medication-row,
  .medication-matrix__cell {
    forced-color-adjust: none;
  }
  
  /* Use system colors */
  .gene-card--poor {
    background: Canvas;
    color: CanvasText;
    border: 2px solid Mark;
  }
  
  .gene-card--intermediate {
    background: Canvas;
    color: CanvasText;
    border: 2px solid Highlight;
  }
  
  .gene-card--normal {
    background: Canvas;
    color: CanvasText;
    border: 2px solid GrayText;
  }
  
  /* Ensure patterns are visible in high contrast */
  .pgx-pattern--moderate,
  .pgx-pattern--significant,
  .pgx-pattern--critical {
    forced-color-adjust: auto;
  }
  
  /* Focus indicators */
  :focus-visible {
    outline: 3px solid Highlight;
    outline-offset: 2px;
  }
}
```

### 12.5 Accessibility Checklist

| Criterion | WCAG 2.1 Level | Implementation | Status |
|---|---|---|---|
| **Color not sole identifier** | A | Patterns + icons + text for all status indicators | Required |
| **Minimum contrast 4.5:1** | AA | All text meets 4.5:1 contrast ratio | Required |
| **Large text contrast 3:1** | AA | Headings and large text meet 3:1 | Required |
| **UI component contrast 3:1** | AA | Borders, icons, interactive elements | Required |
| **Text resize to 200%** | AA | Layout reflows without horizontal scroll | Required |
| **Keyboard accessible** | A | All functionality available via keyboard | Required |
| **Focus visible** | AA | Clear focus indicators on all interactive elements | Required |
| **Screen reader compatible** | A | ARIA labels, roles, live regions | Required |
| **Headings hierarchy** | A | Logical heading structure (H1-H6) | Required |
| **Alt text for images** | A | All non-decorative images have alt text | Required |
| **Touch target 44×44px** | A (best practice) | All touch targets minimum 44px | Required |
| **Reduced motion support** | A | `prefers-reduced-motion` media query | Required |
| **Dark mode support** | - | `prefers-color-scheme: dark` | Recommended |
| **High contrast support** | A | `forced-colors: active` media query | Required |
| **Error identification** | A | Clear error messages with suggestions | Required |
| **Consistent navigation** | AA | Navigation in consistent location | Required |

### 12.6 Screen Reader Testing Scenarios

```
TEST SCENARIO 1: First-Time User Journey
----------------------------------------
1. User navigates to patient report using Tab key
2. Screen reader announces: "Patient Genetic Report for [Name]"
3. User tabs to Key Alerts section
4. Screen reader announces: "Key Alerts: CYP2D6 Poor Metabolizer, 
                              12 medications affected"
5. User presses Enter on alert
6. Screen reader announces: "Gene detail modal opened. 
                              CYP2D6 Poor Metabolizer. 
                              Genotype star 4 slash star 4. 
                              Activity score 0. 
                              12 affected medications."
7. User tabs through medication list
8. Each medication is announced with name, severity, and action

TEST SCENARIO 2: Medication Search
----------------------------------
1. User tabs to search input
2. Screen reader announces: "Search medications, edit text"
3. User types "fluoxetine"
4. Screen reader announces: "3 suggestions available"
5. User navigates suggestions with arrow keys
6. Each suggestion announced with name, class, and severity
7. User selects with Enter
8. Screen reader announces: "Fluoxetine selected. 
                              Moderate interaction with CYP2D6."

TEST SCENARIO 3: Gene Card Exploration
--------------------------------------
1. User tabs to gene card grid
2. Arrow keys navigate between cards
3. Each card announced: "CYP2D6 gene. Poor Metabolizer. 
                         Press Enter for details."
4. User presses Enter
5. Detail modal opens with full gene information
6. User tabs through expanded content
7. Escape closes modal, focus returns to card
```

### 12.7 Accessibility Implementation Code

```html
<!-- Skip to main content link -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<!-- Main landmark -->
<main id="main-content" role="main">
  
  <!-- Navigation landmark -->
  <nav role="navigation" aria-label="Report sections">
    <ul role="list">
      <li><a href="#gene-results">Gene Results</a></li>
      <li><a href="#medications">Medications</a></li>
      <li><a href="#side-effects">Side Effect Risks</a></li>
      <li><a href="#nutrigenomics">Nutrigenomics</a></li>
    </ul>
  </nav>
  
  <!-- Section landmarks -->
  <section id="gene-results" aria-label="Gene Results">
    <h2>Gene Results</h2>
    <!-- Gene cards with proper ARIA -->
  </section>
  
  <section id="medications" aria-label="Medication Interactions">
    <h2>Medication Interactions</h2>
    <!-- Medication table with proper ARIA -->
  </section>
  
</main>

<!-- Live region for dynamic updates -->
<div id="live-region" 
     role="status" 
     aria-live="polite" 
     aria-atomic="true"
     class="sr-only">
</div>

<!-- Visually hidden class for screen reader only content -->
<style>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

---

## Appendix A: Gene-Drug Interaction Reference Table

| Gene | Medication Class | CPIC Level | FDA Label | Clinical Action |
|---|---|---|---|---|
| **CYP2D6** | SSRIs, TCAs, antipsychotics, opioids, beta-blockers | A | Yes | Dose adjustment based on PM/UM status |
| **CYP2C19** | SSRIs, PPIs, clopidogrel, voriconazole | A | Yes | Dose adjustment; clopidogrel alternatives |
| **CYP2C9** | Warfarin, NSAIDs, sulfonylureas | A | Yes | Dose adjustment for warfarin |
| **CYP3A4/5** | Immunosuppressants, statins, CCBs | A | Yes | Dose adjustment for tacrolimus |
| **CYP2B6** | Efavirenz, methadone | A | Yes | Dose adjustment |
| **CYP1A2** | Clozapine, olanzapine | B | No | Monitor levels; smoking induces |
| **HLA-B*15:02** | Carbamazepine, oxcarbazepine | A | Yes (Boxed) | Avoid if positive |
| **HLA-B*57:01** | Abacavir | A | Yes (Boxed) | Avoid if positive |
| **HLA-A*31:01** | Carbamazepine | A | No | Avoid if positive |
| **TPMT** | Thiopurines (azathioprine, 6-MP) | A | Yes | Dose reduction if IM/PM |
| **NUDT15** | Thiopurines | A | Yes | Dose reduction if IM/PM |
| **DPYD** | 5-FU, capecitabine | A | Yes | Avoid or strongly reduce if PM |
| **UGT1A1** | Atazanavir, irinotecan | A | Yes | Dose adjustment |
| **SLCO1B1** | Simvastatin | A | Yes | Dose adjustment |
| **VKORC1** | Warfarin | A | Yes | Dose adjustment |
| **G6PD** | Rasburicase, primaquine, dapsone | A | Yes (Boxed) | Avoid if deficient |

## Appendix B: Platform Feature Comparison Matrix

| Feature | GeneSight | Genomind | Tempus | OneOme | Invitae |
|---|---|---|---|---|---|
| **Color coding** | Green/Yellow/Red | Text-based categories | Integrated in molecular profile | Category-based | Standard report |
| **Gene-drug matrix** | Dot chart | Table in report | Available | Category list | Table format |
| **Interactive portal** | Limited | GenMedPro | Comprehensive | RightMed Advisor | Yes |
| **Medication classes** | 6 (psych only) | 10+ | Multiple | 20+ | Panel-dependent |
| **Clinical trial matching** | No | No | Yes | No | No |
| **Drug-drug interactions** | No | Yes (GenMedPro) | No | No | No |
| **Patient wallet card** | Yes | Yes | No | No | No |
| **Evidence levels** | Clinical considerations | Literature references | Integrated | CPIC/FDA/DPWG | CPIC/FDA |
| **Smoking status** | CYP1A2 sections | Environmental factors | No | No | No |
| **HLA testing** | Yes | Yes | Yes | Yes | Yes |
| **Nutrigenomics (MTHFR)** | Yes | Yes | No | No | No |
| **Pharmacodynamic genes** | Yes (limited) | Yes (extensive) | No | No | No |
| **Export options** | PDF | PDF + Card | Digital + PDF | PDF + Interactive | PDF + Portal |
| **Genetic counseling** | Available | Available | No | Available | Included |
| **Mobile responsive** | Limited | Yes | Yes | Yes | Yes |

## Appendix C: Evidence Level Definitions

| Level | Description | Source | Action Required |
|---|---|---|---|
| **CPIC Level A** | Genes with strong evidence; pharmacogenomic testing should be used to change prescribing | CPIC | Mandatory consideration |
| **CPIC Level B** | Genes with moderate evidence; pharmacogenomic testing may be used to change prescribing | CPIC | Recommended consideration |
| **CPIC Level C** | Optional reporting; evidence is limited | CPIC | Informational |
| **CPIC Level D** | Research only; no prescribing changes recommended | CPIC | Not clinically actionable |
| **FDA Table** | Listed on FDA Table of Pharmacogenetic Associations | FDA | Reference only |
| **FDA Label** | Mentioned in FDA-approved drug labeling | FDA | Follow label guidance |
| **FDA Boxed** | FDA Boxed Warning requiring testing | FDA | Mandatory testing |
| **DPWG 1** | Gene-drug interaction: dose adjustment or alternative | DPWG | Action recommended |
| **DPWG 2** | Gene-drug interaction: monitoring required | DPWG | Monitoring recommended |
| **DPWG 3** | Gene-drug interaction: useful pharmacogenetic information | DPWG | Informational |
| **PharmGKB 1A** | High-level evidence from replicated studies | PharmGKB | High confidence |
| **PharmGKB 1B** | High-level evidence from single study | PharmGKB | Moderate-high confidence |
| **PharmGKB 2A** | Moderate evidence from replicated studies | PharmGKB | Moderate confidence |
| **PharmGKB 2B** | Moderate evidence from single study | PharmGKB | Moderate confidence |
| **PharmGKB 3** | Low-level evidence | PharmGKB | Limited confidence |
| **PharmGKB 4** | Annotation from PharmGKB only | PharmGKB | Minimal confidence |

---

*This report was compiled from publicly available documentation, sample reports, provider portals, and clinical guidelines from the benchmarked platforms. All trademarks belong to their respective owners. Clinical decision-making should always incorporate comprehensive patient assessment beyond pharmacogenomic testing results.*

**Document End**
