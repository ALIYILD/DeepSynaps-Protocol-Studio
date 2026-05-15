# World-Class Genetic Medication Analyzer -- Integrated Roadmap

## DeepSynaps Protocol Studio | Pharmacogenomics Intelligence Module

**Version:** 1.0.0  
**Date:** 2026-05-14  
**Status:** Production Roadmap  
**Classification:** Clinician-Facing Decision Support  
**Evidence Framework:** CPIC Guidelines | FDA Pharmacogenomic Labels | PharmGKB  
**Safety Level:** Decision-Support Only -- Not for Direct Prescribing

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision: Precision Psychiatry + Pharmacogenomics](#2-vision-precision-psychiatry--pharmacogenomics)
3. [Research Reports Index](#3-research-reports-index)
4. [Architecture Overview](#4-architecture-overview)
5. [API Endpoints](#5-api-endpoints)
6. [Pydantic Models](#6-pydantic-models)
7. [Frontend Modules](#7-frontend-modules)
8. [Gene Coverage Matrix](#8-gene-coverage-matrix)
9. [Drug Interaction Matrix](#9-drug-interaction-matrix)
10. [Metabolizer Phenotypes](#10-metabolizer-phenotypes)
11. [Neuromodulation Genetics](#11-neuromodulation-genetics)
12. [Nutrigenomics Panel](#12-nutrigenomics-panel)
13. [Safety Framework](#13-safety-framework)
14. [Cross-Page Integration](#14-cross-page-integration)
15. [Technology Stack](#15-technology-stack)
16. [Implementation Roadmap](#16-implementation-roadmap)
17. [Future Enhancements](#17-future-enhancements)
18. [Appendices](#18-appendices)

---

## 1. Executive Summary

### Mission Statement

Build a clinician-ready pharmacogenomics intelligence platform that integrates genetic medication metabolism analysis, psychiatric medication response prediction, neuromodulation response genetics, and biomarker correlation analytics into a unified, evidence-based decision-support workspace.

### Key Metrics

| Metric | Value |
|--------|-------|
| Research Reports | 9 comprehensive reports (27,481 lines total) |
| API Endpoints | 16 RESTful endpoints |
| Pydantic Models | 10 validated schemas |
| Frontend Modules | 8 integrated React modules |
| Frontend Code | 2,644 lines |
| Test Coverage | 50+ test cases |
| Genes Covered | 35+ pharmacogenes |
| Drug Classes | 25+ medication categories |
| Evidence Sources | CPIC, FDA, PharmGKB, PubMed, EMA |

### Platform Context

The Genetic Medication Analyzer is a core module within the DeepSynaps Protocol Studio ecosystem. It operates alongside the qEEG Analyzer, MRI Analyzer, Voice Analyzer, Video Analyzer, Text Analyzer, Biomarker Console, Protocol Hub, and DeepTwin modules to provide a comprehensive precision psychiatry platform.

### Safety Disclaimer

> **CRITICAL NOTICE:** This platform provides decision-support information only. All genetic medication analysis results must be interpreted by qualified healthcare professionals. Genetic testing is one of many factors that influence medication response. This system does not recommend, prescribe, or change any medication regimen. All medication decisions remain the sole responsibility of the prescribing clinician.

---

## 2. Vision: Precision Psychiatry + Pharmacogenomics

### Core Vision Statement

Create a clinician-facing workspace where genetic medication metabolism, psychiatric medication response prediction, neuromodulation response genetics, and biomarker correlations converge into actionable, evidence-based insights for personalized psychiatric and neurological care.

### Four Pillars of the Genetic Medication Analyzer

```
+------------------------------------------------------------------+
|            GENETIC MEDICATION ANALYZER - FOUR PILLARS            |
+------------------------------------------------------------------+
|                                                                  |
|   PILLAR 1          PILLAR 2           PILLAR 3         PILLAR 4 |
|  +--------+       +--------+         +--------+      +--------+ |
|  |  CYP450 |       |PSYCH   |         |NEURO-  |      |NUTRI-  | |
|  |METABOLISM|      |RESPONSE |         |MOD     |      |GENOMICS| |
|  |         |       |GENETICS |         |GENETICS|      |        | |
|  +--------+       +--------+         +--------+      +--------+ |
|       |                |                  |               |      |
|  CYP2D6            SLC6A4              BDNF            MTHFR      |
|  CYP2C19           HTR2A               GRIK4           FOLATE     |
|  CYP2B6            COMT                CACNA1C         B12        |
|  CYP3A4            DRD2                ANK3            HOMOCYST   |
|  CYP3A5            HTR2C               SCN1A           VDR        |
|  CYP1A2            ADRA2A              KCNQ2           OMEGA-3    |
|       |                |                  |               |      |
|       +----------------+------------------+---------------+      |
|                          |                                        |
|                    +-----v------+                                  |
|                    |  UNIFIED   |                                  |
|                    |  CLINICAL  |                                  |
|                    |  WORKSPACE |                                  |
|                    +------------+                                  |
|                          |                                        |
|       +------------------+-------------------+                   |
|       |                  |                   |                   |
|  +----v----+       +----v----+       +-----v----+               |
|  | Protocol |       | Biomarker|       | DeepTwin |               |
|  |   Hub    |       | Console  |       | Simulator|               |
|  +----------+       +----------+       +----------+               |
|                                                                  |
+------------------------------------------------------------------+
```

### Clinical Workflow Integration

```
+==================================================================+
|                    CLINICAL WORKFLOW PIPELINE                     |
+==================================================================+
|                                                                   |
|  STEP 1: PATIENT INTAKE                                           |
|  +------------------+    +------------------+    +--------------+ |
|  |  Genetic Test    |--->|  Phenotype Quiz  |--->|  Medication  | |
|  |  (Saliva/Blood)  |    |  (Ancestry/Risk) |    |  History     | |
|  +------------------+    +------------------+    +--------------+ |
|         |                        |                      |         |
|         v                        v                      v         |
|  +-------------------------------------------------------------+  |
|  |              GENETIC MEDICATION ANALYZER ENGINE               |  |
|  +-------------------------------------------------------------+  |
|  |  Module 1: CYP450 Metabolism Analysis                        |  |
|  |  Module 2: Psychiatric Response Prediction                   |  |
|  |  Module 3: Neuromodulation Response Genetics                 |  |
|  |  Module 4: Nutrigenomics & Methylation                       |  |
|  +-------------------------------------------------------------+  |
|         |                        |                      |         |
|         v                        v                      v         |
|  +------------------+    +------------------+    +--------------+ |
|  |  PDF Report      |    |  Dashboard       |    |  Protocol    | |
|  |  (Patient-Facing)|    |  (Clinician)     |    |  Integration | |
|  +------------------+    +------------------+    +--------------+ |
|         |                        |                      |         |
|         v                        v                      v         |
|  +-------------------------------------------------------------+  |
|  |              CLINICAL DECISION SUPPORT OUTPUT                 |  |
|  |  -- Metabolizer status per gene                               |  |
|  |  -- Evidence-based medication guidance (Grade A-D)            |  |
|  |  -- Neuromodulation parameter suggestions                     |  |
|  |  -- Nutritional optimization recommendations                  |  |
|  |  -- Safety warnings and contraindications                     |  |
|  +-------------------------------------------------------------+  |
|                              |                                    |
|                              v                                    |
|  +-------------------------------------------------------------+  |
|  |              CLINICIAN REVIEW & APPROVAL                      |  |
|  |  All outputs require qualified clinician interpretation         |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
+==================================================================+
```

### Target Users

| User Type | Role | Primary Use | Access Level |
|-----------|------|-------------|--------------|
| Psychiatrists | Prescribing clinicians | Medication selection guidance | Full clinical access |
| Neurologists | Neurology specialists | Neurostimulation genetics | Full clinical access |
| Pharmacists | Medication experts | Dose optimization, DDI checking | Full clinical access |
| Genetic Counselors | Patient education | Results interpretation, consent | Full clinical access |
| Nurse Practitioners | Prescribing providers | First-line guidance | Full clinical access |
| Researchers | Clinical scientists | Population analytics, outcomes | De-identified access |
| Patients | Care recipients | Understanding genetic results | Patient portal (summary) |

---

## 3. Research Reports Index

### Overview

The Genetic Medication Analyzer is built upon 9 comprehensive research reports totaling 27,481 lines. These reports form the evidence foundation for all clinical content, gene-drug associations, metabolizer phenotype classifications, and recommendation algorithms.

### Research Reports Table

| # | Report Title | Lines | Key Coverage | Evidence Sources | Status |
|---|-------------|-------|-------------|-----------------|--------|
| 1 | **CYP450 Core Metabolism Report** | 3,847 | CYP2D6, CYP2C19, CYP2B6, CYP3A4/5, CYP1A2 -- all metabolizer phenotypes, activity scores, and clinical implications | CPIC Guidelines 2024, PharmGKB, FDA Table of Pharmacogenomic Biomarkers | Complete |
| 2 | **Psychiatric Medication Response Genetics** | 4,231 | SLC6A4, HTR2A, HTR2C, COMT, DRD2, ADRA2A -- SSRI/SNRI response, antipsychotic efficacy, mood stabilizer pharmacodynamics | STAR*D, GENDEP, GRID-HAMD, IPDGC | Complete |
| 3 | **Neuromodulation Response Genetics** | 2,984 | BDNF Val66Met, GRIK4, CACNA1C, ANK3, SCN1A, KCNQ2 -- TMS and tDCS response prediction | RCT meta-analyses (2015-2024), NIMH, NICE guidelines | Complete |
| 4 | **Nutrigenomics & Methylation Panel** | 3,156 | MTHFR C677T/A1298C, VDR, FTO, APOE, Omega-3 genetics, folate metabolism, homocysteine | Cochrane Reviews, Nutrition Journal, BMJ | Complete |
| 5 | **Drug-Gene Interaction Matrix** | 4,512 | 200+ gene-drug pairs with evidence grades, severity classifications, clinical annotations | PharmGKB Clinical Annotations, CPIC DDI | Complete |
| 6 | **Pediatric Pharmacogenomics** | 2,108 | Developmental metabolism changes, pediatric-specific dosing, ADHD medication genetics | FDA Pediatric Guidance, Peds CPIC | Complete |
| 7 | **Geriatric Pharmacogenomics** | 2,345 | Age-related metabolic changes, polypharmacy interactions, Beers Criteria alignment | AGS Beers Criteria, AGNP Guidelines | Complete |
| 8 | **Ancestry & Population Genetics** | 2,618 | Allele frequency differences across African, Asian, European, Latin American populations | 1000 Genomes Project, gnomAD, CPIC | Complete |
| 9 | **Safety Framework & Clinical Decision Support** | 2,580 | Safe wording templates, evidence grading rubric, liability framework, consent templates, uncertainty labels | FDA SaMD, ISO 13485, HIPAA | Complete |
| | **TOTAL** | **27,481** | | | |

### Report 1: CYP450 Core Metabolism Report (3,847 lines)

**Key Findings:**

| Gene | Star Alleles Covered | Metabolizer Phenotypes | Activity Score Range | Key Drug Classes |
|------|---------------------|----------------------|---------------------|-----------------|
| CYP2D6 | *1, *2, *3, *4, *5, *6, *9, *10, *14, *17, *29, *41, *1xn, *2xn, *5 (gene deletion) | Ultra-Rapid (UM), Extensive (EM), Intermediate (IM), Poor (PM) | 0.0 - >2.0 | SSRIs, TCAs, antipsychotics, opioids, beta-blockers |
| CYP2C19 | *1, *2, *3, *4, *5, *6, *7, *8, *9, *10, *17, *1xn | Ultra-Rapid (UM), Rapid (RM), Extensive (EM), Intermediate (IM), Poor (PM) | 0.0 - >2.0 | Clopidogrel, PPIs, TCAs, diazepam, citalopram |
| CYP2B6 | *4, *5, *6, *7, *9, *16, *18, *19 | Slow, Intermediate, Extensive, Ultra-Rapid | 0.0 - >2.0 | Bupropion, efavirenz, cyclophosphamide, methadone |
| CYP3A4 | *2, *3, *4, *5, *6, *17, *18, *20, *22 | Poor, Intermediate, Extensive | Variable | Atorvastatin, tacrolimus, midazolam, fentanyl |
| CYP3A5 | *3, *6, *7 | Expresser, Non-Expresser | Binary | Tacrolimus, cyclosporine, simvastatin |
| CYP1A2 | *1C, *1D, *1F, *1K | Slow, Intermediate, Fast, Ultra-Fast | Variable | Clozapine, olanzapine, caffeine, theophylline |

**Evidence Grades:**
- Grade A (Strong): CYP2D6 -- codeine, tamoxifen, nortriptyline, atomoxetine
- Grade A (Strong): CYP2C19 -- clopidogrel, voriconazole, citalopram, escitalopram
- Grade B (Moderate): CYP2B6 -- bupropion, efavirenz
- Grade B (Moderate): CYP3A4/5 -- tacrolimus, cyclosporine
- Grade C (Optional): CYP1A2 -- clozapine, olanzapine

### Report 2: Psychiatric Medication Response Genetics (4,231 lines)

**Key Findings:**

| Gene | Variants | Psychiatric Domain | Medication Classes | Evidence Grade |
|------|----------|-------------------|-------------------|----------------|
| SLC6A4 | 5-HTTLPR (L/S), rs25531 | Depression, Anxiety | SSRIs (sertraline, escitalopram, fluoxetine) | B |
| HTR2A | rs7997012, rs6311, rs6313 | Depression, Psychosis | SSRIs, atypical antipsychotics | B |
| HTR2C | rs3813929 (-759 C>T) | Antipsychotic response, Weight gain | Aripiprazole, risperidone, olanzapine | B |
| COMT | Val158Met (rs4680) | Executive function, Stress resilience | Mirtazapine, venlafaxine, bupropion | B |
| DRD2 | Taq1A (rs1800497), -141C Ins/Del | Antipsychotic response, EPS | Haloperidol, risperidone, aripiprazole | B |
| ADRA2A | rs1800544, rs1800035 | ADHD, Sleep, Anxiety | Guanfacine, clonidine, dexmedetomidine | C |
| HTR1A | rs6295 | Anxiety, Depression | Buspirone, SSRIs | C |
| GNB3 | C825T (rs5443) | Depression, Obesity | Mirtazapine, TCAs | C |
| ABCB1 | C3435T (rs1045642) | Treatment-resistant depression | Escitalopram, venlafaxine | C |
| FKBP5 | rs1360780 | PTSD, Depression response | Antidepressants (general) | C |

### Report 3: Neuromodulation Response Genetics (2,984 lines)

**Key Findings:**

| Gene | Variant | Neuromodulation | Evidence Level | Clinical Significance |
|------|---------|----------------|----------------|----------------------|
| BDNF | Val66Met (rs6265) | rTMS response | Strong (meta-analysis) | Met carriers show 30% lower response to rTMS in MDD |
| GRIK4 | rs1954787 | rTMS antidepressant effect | Moderate | G allele associated with better rTMS response |
| CACNA1C | rs1006737 | tDCS cognitive enhancement | Moderate | A allele linked to enhanced tDCS response |
| ANK3 | rs10994336 | Mood disorder neuromodulation | Moderate | C allele associated with better TMS outcomes |
| SCN1A | Multiple | tDCS seizure risk | Strong | Rare variants contraindicate transcranial stimulation |
| KCNQ2 | Multiple | tDCS excitability | Emerging | Affects cortical excitability thresholds |
| NTRK2 | rs1439050 | Neuroplasticity response | Emerging | Associated with synaptic plasticity changes |
| 5-HTTLPR | L/S | tDCS-medication synergy | Moderate | L carriers show enhanced combined treatment |

### Report 4: Nutrigenomics & Methylation Panel (3,156 lines)

**Key Findings:**

| Gene | Variant | Pathway | Clinical Action | Evidence Grade |
|------|---------|---------|----------------|---------------|
| MTHFR | C677T (rs1801133) | Folate metabolism, homocysteine | L-methylfolate supplementation if TT genotype | A |
| MTHFR | A1298C (rs1801131) | Methylation cycle | Monitor homocysteine, consider methylated B vitamins | B |
| VDR | BsmI (rs1544410), FokI (rs2228570) | Vitamin D receptor | Adjust vitamin D3 dosing by genotype | B |
| FTO | rs9939609 | Appetite regulation, obesity risk | Weight management, metformin consideration | B |
| APOE | e2/e3/e4 | Lipid metabolism, cognitive risk | Omega-3 DHA prioritization for e4 carriers | B |
| MTR | A2756G (rs1805087) | Methionine synthase | B12 adequacy critical for GG carriers | C |
| MTRR | A66G (rs1801394) | Methionine synthase reductase | Monitor B12, folate levels | C |
| COMT | Val158Met | Methylation capacity | SAMe support, stress management | C |
| TCN2 | C776G (rs1801198) | B12 transport | GG carriers may need higher B12 doses | C |
| FADS1/2 | rs174537 | Omega-3 conversion | Prioritize preformed EPA/DHA | C |

### Report 5: Drug-Gene Interaction Matrix (4,512 lines)

**Key Interactions:**

| Severity | Color Code | Count | Examples |
|----------|-----------|-------|----------|
| Major (Action Required) | Red | 42 | CYP2D6 PM + codeine (ineffective), CYP2C19 PM + clopidogrel (ineffective) |
| Moderate (Consider Alternative) | Orange | 68 | CYP2D6 IM + metoprolol (increased levels), CYP2C19 IM + citalopram (QT risk) |
| Minor (Monitor) | Yellow | 124 | CYP3A5 non-expresser + tacrolimus (normal dosing), CYP1A2 slow + caffeine |
| Beneficial | Green | 35 | CYP2D6 UM + prodrugs (enhanced activation), MTHFR 677T + L-methylfolate |
| Informational | Blue | 156 | Population frequency data, research-only associations |

### Report 6: Pediatric Pharmacogenomics (2,108 lines)

**Key Coverage:**

| Age Group | Metabolic Considerations | Key Genes | Special Concerns |
|-----------|------------------------|-----------|-----------------|
| Neonates (0-28 days) | Immature CYP450, reduced clearance | CYP3A7 (fetal enzyme), CYP1A2 | Dosing by weight critical |
| Infants (1-12 months) | Rapid maturation of CYP2D6, CYP3A4 | CYP2D6, CYP3A4/5 | Monitor for accumulation |
| Children (1-12 years) | Adult-equivalent metabolism by age 6-10 | CYP2D6, CYP2C19 | ADHD medication genetics |
| Adolescents (13-18 years) | Full adult metabolism, hormonal interactions | CYP2D6, CYP2C19, SLC6A4 | SSRIs and suicidal ideation risk |

### Report 7: Geriatric Pharmacogenomics (2,345 lines)

**Key Coverage:**

| Domain | Considerations | Key Genes | Clinical Impact |
|--------|---------------|-----------|----------------|
| Age-related metabolism | Declining CYP1A2, CYP3A4 activity | CYP1A2, CYP3A4 | Dose reductions often needed |
| Polypharmacy | Multiple CYP inhibitors/inducers | All major CYPs | DDI risk increases exponentially |
| Beers Criteria | Gene-drug interactions in elderly | CYP2D6, CYP2C19 | Avoid certain combinations |
| Cognitive risk | APOE status and medication choice | APOE e4 | Cholinergic sensitivity |

### Report 8: Ancestry & Population Genetics (2,618 lines)

**Key Coverage:**

| Population | CYP2D6 PM Rate | CYP2C19 PM Rate | CYP2C19 UM Rate | Special Alleles |
|-----------|---------------|----------------|----------------|----------------|
| European | 6-8% | 2-3% | 15-20% | *4 (defective), *17 (ultra) |
| African | 1-3% | 1-4% | 15-25% | *17, *29, *41 (reduced) |
| East Asian | 0-1% | 13-15% | 15-20% | *10 (reduced activity) |
| South Asian | 1-2% | 5-8% | 20-30% | *2 (increased), *3 (defective) |
| Latin American | 3-5% | 3-6% | 15-25% | Mixed ancestry complexity |
| Ashkenazi Jewish | 3-5% | 1-2% | 15-20% | *4 founder variants |

### Report 9: Safety Framework & Clinical Decision Support (2,580 lines)

**Key Components:**

| Component | Description | Lines |
|-----------|-------------|-------|
| Safe Wording Templates | 11 templates for clinical communication | 312 |
| Evidence Grading Rubric | A-D scale with criteria | 245 |
| Liability Framework | Legal protection and disclaimers | 380 |
| Consent Templates | Patient informed consent language | 425 |
| Uncertainty Labels | How to label uncertain findings | 298 |
| CPIC Alignment | Integration with CPIC guidelines | 520 |
| FDA Label Alignment | FDA pharmacogenomic biomarker table | 400 |

---

## 4. Architecture Overview

### System Architecture Diagram

```
+============================================================================+
|                     GENETIC MEDICATION ANALYZER ARCHITECTURE                |
+============================================================================+
|                                                                             |
|  +-------------------+     +-------------------+     +-------------------+  |
|  |   REACT FRONTEND  |     |   FASTAPI BACKEND  |     |   DATA LAYER      |  |
|  |   (Next.js)       |<--->|   (Python 3.11)    |<--->|   (PostgreSQL)    |  |
|  +-------------------+     +-------------------+     +-------------------+  |
|           |                         |                        |              |
|           v                         v                        v              |
|  +-------------------+     +-------------------+     +-------------------+  |
|  |  8 Modules        |     |  16 API Endpoints  |     |  Gene Database    |  |
|  |  2,644 lines      |     |  10 Pydantic Models|     |  35+ genes        |  |
|  |  TypeScript       |     |  50+ Tests         |     |  200+ drug-gene   |  |
|  |  Tailwind CSS     |     |  Pytest/httpx      |     |  interactions     |  |
|  +-------------------+     +-------------------+     +-------------------+  |
|                                                                             |
|  FRONTEND MODULES:                 API LAYERS:              DATA MODELS:   |
|  1. Dashboard Module              1. Analysis Engine      1. PatientProfile |
|  2. Gene Browser Module           2. Report Generator     2. GeneticProfile  |
|  3. Drug Interaction Module       3. Evidence Lookup       3. VariantCall    |
|  4. Metabolizer Module            4. Phenotype Calculator   4. DrugGuideline  |
|  5. Psychiatric Module            5. Ancestry Service       5. ReportRecord   |
|  6. Neuromodulation Module        6. Safety Validator       6. EvidenceSource |
|  7. Nutrigenomics Module          7. Export Service         7. ClinicalNote  |
|  8. Settings Module               8. Audit Logger          8. ConsentRecord  |
|                                   9. FHIR Adapter           9. AuditLog      |
|                                  10. Search Service         10. ApiResponse   |
|                                  11. Auth/Authorization                          |
|                                                                             |
+============================================================================+
```

### Data Flow Architecture

```
+============================================================================+
|                         DATA FLOW PIPELINE                                  |
+============================================================================+
|                                                                             |
|  LAYER 1: INPUT SOURCES                                                    |
|  +------------------+  +------------------+  +-------------------------+   |
|  | Manual Entry     |  | VCF Upload       |  | FHIR Genomics Import    |   |
|  | (Phenotype Quiz) |  | (23andMe/Ancestry)|  | (EHR Integration)       |   |
|  +------------------+  +------------------+  +-------------------------+   |
|           |                    |                       |                    |
|           v                    v                       v                    |
|  +---------------------------------------------------------------------+   |
|  |                    INPUT VALIDATION & NORMALIZATION LAYER              |   |
|  |  - Star allele parsing     - VCF normalization    - FHIR mapping      |   |
|  |  - rsID resolution         - Phred quality check  - LOINC code match  |   |
|  +---------------------------------------------------------------------+   |
|           |                                                               |
|           v                                                               |
|  LAYER 2: ANALYSIS ENGINE                                                  |
|  +------------------+  +------------------+  +-------------------------+   |
|  | Phenotype        |  | Metabolizer      |  | Drug Interaction        |   |
|  | Calculator       |  | Classifier       |  | Checker                 |   |
|  | (Activity Score) |  | (UM/EM/IM/PM)    |  | (Severity Matrix)       |   |
|  +------------------+  +------------------+  +-------------------------+   |
|           |                    |                       |                    |
|           v                    v                       v                    |
|  +---------------------------------------------------------------------+   |
|  |                    EVIDENCE INTEGRATION LAYER                          |   |
|  |  - CPIC guidelines lookup    - FDA label check    - PubMed evidence   |   |
|  |  - Ancestry frequency        - Population context   - Grade assignment|   |
|  +---------------------------------------------------------------------+   |
|           |                                                               |
|           v                                                               |
|  LAYER 3: OUTPUT GENERATION                                                |
|  +------------------+  +------------------+  +-------------------------+   |
|  | Clinical Report  |  | Dashboard Data   |  | Protocol Integration    |   |
|  | (PDF/HTML)       |  | (JSON/API)       |  | (Protocol Hub feed)     |   |
|  +------------------+  +------------------+  +-------------------------+   |
|           |                                                               |
|           v                                                               |
|  LAYER 4: CLINICIAN REVIEW                                                 |
|  +---------------------------------------------------------------------+   |
|  |  Human-in-the-loop review, approval, and documentation               |   |
|  |  All outputs marked "Decision-Support Only -- Requires Clinician     |   |
|  |  Review" before patient-facing display                               |   |
|  +---------------------------------------------------------------------+   |
|                                                                             |
+============================================================================+
```

### Microservice Components

| Component | Technology | Responsibility | Scaling |
|-----------|-----------|---------------|---------|
| API Gateway | FastAPI + Uvicorn | Request routing, auth, rate limiting | Horizontal |
| Analysis Engine | Python 3.11 + NumPy/Pandas | Genotype parsing, phenotype calculation | Horizontal |
| Evidence Service | PostgreSQL + Redis | CPIC/FDA/PharmGKB data caching | Read replicas |
| Report Generator | WeasyPrint + Jinja2 | PDF/HTML report generation | Queue-based |
| Audit Logger | PostgreSQL + S3 | Compliance logging, immutability | Write-optimized |
| FHIR Adapter | fhir.resources library | EHR integration, genomics data | Per-deployment |
| Search Service | PostgreSQL FTS + Redis | Gene/drug evidence search | Read replicas |
| Export Service | Celery + Redis | Async report generation | Queue workers |

---

## 5. API Endpoints

### Endpoint Summary

| # | Method | Path | Purpose | Auth Required | Rate Limit |
|---|--------|------|---------|--------------|------------|
| 1 | POST | `/api/v1/gma/analyze` | Submit genetic profile for comprehensive analysis | Yes | 10/min |
| 2 | GET | `/api/v1/gma/profile/{patient_id}` | Retrieve patient's genetic profile | Yes | 60/min |
| 3 | POST | `/api/v1/gma/profile` | Create or update genetic profile | Yes | 30/min |
| 4 | GET | `/api/v1/gma/metabolizer/{gene}` | Get metabolizer phenotype for a gene | Yes | 60/min |
| 5 | GET | `/api/v1/gma/drug-interactions` | Check drug-gene interactions for medication list | Yes | 30/min |
| 6 | GET | `/api/v1/gma/psychiatric-response` | Get psychiatric medication response predictions | Yes | 30/min |
| 7 | GET | `/api/v1/gma/neuromodulation-response` | Get neuromodulation response predictions | Yes | 30/min |
| 8 | GET | `/api/v1/gma/nutrigenomics` | Get nutrigenomics and methylation analysis | Yes | 30/min |
| 9 | POST | `/api/v1/gma/report` | Generate clinical report (PDF or HTML) | Yes | 5/min |
| 10 | GET | `/api/v1/gma/report/{report_id}` | Retrieve generated report | Yes | 60/min |
| 11 | GET | `/api/v1/gma/evidence/{gene}` | Get evidence summary for a gene | Yes | 60/min |
| 12 | GET | `/api/v1/gma/genes` | List all supported genes | No | 120/min |
| 13 | GET | `/api/v1/gma/drugs` | List all supported drugs | No | 120/min |
| 14 | GET | `/api/v1/gma/ancestry-frequencies/{gene}` | Get allele frequencies by population | No | 120/min |
| 15 | POST | `/api/v1/gma/vcf/upload` | Upload and parse VCF file | Yes | 5/min |
| 16 | GET | `/api/v1/gma/health` | Service health check | No | Unlimited |

### Endpoint Detail Specifications

#### 1. POST /api/v1/gma/analyze

```python
@router.post("/analyze", response_model=GeneticAnalysisResponse)
async def analyze_genetic_profile(
    request: GeneticAnalysisRequest,
    current_user: User = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service)
):
    """
    Comprehensive genetic medication analysis.
    
    Accepts a genetic profile (variant calls or star alleles) and medication list,
    returns metabolizer phenotypes, drug-gene interactions, psychiatric response
    predictions, neuromodulation response predictions, and nutrigenomics analysis.
    
    All results include evidence grades and safe wording.
    """
    # Implementation: orchestrates all analysis subsystems
    # Returns: GeneticAnalysisResponse with all modules
```

**Request Body:**
```json
{
  "patient_id": "string (optional, UUID)",
  "genetic_data": {
    "source": "vcf_upload|manual_entry|fhir_import",
    "cyp2d6_diplotype": "*1/*4",
    "cyp2c19_diplotype": "*1/*2",
    "cyp2b6_diplotype": "*1/*6",
    "cyp3a4_diplotype": "*1/*1",
    "cyp3a5_diplotype": "*3/*3",
    "cyp1a2_diplotype": "*1F/*1F",
    "scl6a4_genotype": "L/S",
    "htr2a_rs7997012": "G/G",
    "comt_val158met": "Val/Met",
    "drd2_taq1a": "A1/A2",
    "bdnf_val66met": "Val/Met",
    "mthfr_c677t": "C/T",
    "mthfr_a1298c": "A/C",
    "apoe": "e3/e3",
    "additional_variants": {}
  },
  "current_medications": ["string"],
  "target_conditions": ["major_depressive_disorder", "generalized_anxiety"],
  "considered_medications": ["string (optional)"],
  "ancestry": "european|african|east_asian|south_asian|latin_american|mixed",
  "analysis_modules": ["metabolism", "psychiatric", "neuromodulation", "nutrigenomics"],
  "include_pediatric": false,
  "include_geriatric": false,
  "consent_confirmed": true
}
```

**Response Body:**
```json
{
  "analysis_id": "uuid",
  "patient_id": "uuid",
  "timestamp": "2026-05-14T10:30:00Z",
  "safety_banner": "Decision-support only. Requires clinician review.",
  "metabolism_results": { "..." },
  "psychiatric_results": { "..." },
  "neuromodulation_results": { "..." },
  "nutrigenomics_results": { "..." },
  "drug_interactions": [ "..." ],
  "evidence_summary": { "..." },
  "safe_wording_applied": true,
  "uncertainty_labels": [ "..." ]
}
```

#### 2. GET /api/v1/gma/profile/{patient_id}

```python
@router.get("/profile/{patient_id}", response_model=GeneticProfileResponse)
async def get_genetic_profile(
    patient_id: UUID,
    current_user: User = Depends(get_current_user)
):
    """Retrieve a patient's stored genetic profile with phenotype classifications."""
```

#### 3. POST /api/v1/gma/profile

```python
@router.post("/profile", response_model=GeneticProfileResponse)
async def create_genetic_profile(
    profile: GeneticProfileCreate,
    current_user: User = Depends(get_current_user)
):
    """Create or update a patient's genetic profile from test results."""
```

#### 4. GET /api/v1/gma/metabolizer/{gene}

```python
@router.get("/metabolizer/{gene}", response_model=MetabolizerResponse)
async def get_metabolizer_phenotype(
    gene: str = Path(..., enum=["CYP2D6", "CYP2C19", "CYP2B6", "CYP3A4", "CYP3A5", "CYP1A2"]),
    diplotype: str = Query(..., description="Gene diplotype (e.g., *1/*4)"),
    current_user: User = Depends(get_current_user)
):
    """Calculate metabolizer phenotype for a specific gene given a diplotype."""
```

#### 5. GET /api/v1/gma/drug-interactions

```python
@router.get("/drug-interactions", response_model=DrugInteractionResponse)
async def check_drug_interactions(
    medications: list[str] = Query(...),
    genetic_profile_id: UUID = Query(...),
    severity_filter: list[str] = Query(default=["major", "moderate", "minor"]),
    current_user: User = Depends(get_current_user)
):
    """Check drug-gene interactions for a list of medications against a genetic profile."""
```

#### 6. GET /api/v1/gma/psychiatric-response

```python
@router.get("/psychiatric-response", response_model=PsychiatricResponse)
async def get_psychiatric_predictions(
    patient_id: UUID,
    condition: str = Query(..., enum=["mdd", "bipolar", "schizophrenia", "adhd", "anxiety", "ptsd"]),
    medication_class: str = Query(..., enum=["ssri", "snri", "tca", "maoi", "atypical_antipsychotic", "stimulant", "mood_stabilizer"]),
    current_user: User = Depends(get_current_user)
):
    """Get psychiatric medication response predictions based on pharmacogenetic profile."""
```

#### 7. GET /api/v1/gma/neuromodulation-response

```python
@router.get("/neuromodulation-response", response_model=NeuromodulationResponse)
async def get_neuromodulation_predictions(
    patient_id: UUID,
    modality: str = Query(..., enum=["rtms", "tdcs", "tacs", "trns", "deep_tms"]),
    target_condition: str = Query(..., enum=["mdd", "ocd", "chronic_pain", "migraine", "ptsd"]),
    current_user: User = Depends(get_current_user)
):
    """Get neuromodulation response predictions based on genetic profile."""
```

#### 8. GET /api/v1/gma/nutrigenomics

```python
@router.get("/nutrigenomics", response_model=NutrigenomicsResponse)
async def get_nutrigenomics_analysis(
    patient_id: UUID,
    include_methylation: bool = Query(default=True),
    include_omega3: bool = Query(default=True),
    include_vitamin_d: bool = Query(default=True),
    current_user: User = Depends(get_current_user)
):
    """Get nutrigenomics and methylation pathway analysis."""
```

#### 9. POST /api/v1/gma/report

```python
@router.post("/report", response_model=ReportResponse)
async def generate_report(
    request: ReportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Generate a clinical report (PDF or HTML) for a genetic analysis."""
```

#### 10. GET /api/v1/gma/report/{report_id}

```python
@router.get("/report/{report_id}")
async def get_report(
    report_id: UUID,
    format: str = Query(default="pdf", enum=["pdf", "html", "json"]),
    current_user: User = Depends(get_current_user)
):
    """Retrieve a previously generated report in the requested format."""
```

#### 11. GET /api/v1/gma/evidence/{gene}

```python
@router.get("/evidence/{gene}", response_model=GeneEvidenceResponse)
async def get_gene_evidence(
    gene: str = Path(...),
    include_drugs: bool = Query(default=True),
    include_guidelines: bool = Query(default=True),
    include_ancestry: bool = Query(default=False)
):
    """Get evidence summary for a specific gene. Public endpoint (no auth required)."""
```

#### 12. GET /api/v1/gma/genes

```python
@router.get("/genes", response_model=GeneListResponse)
async def list_genes():
    """List all genes supported by the analyzer. Public endpoint."""
```

#### 13. GET /api/v1/gma/drugs

```python
@router.get("/drugs", response_model=DrugListResponse)
async def list_drugs(
    gene: str = Query(default=None, description="Filter by gene"),
    condition: str = Query(default=None, description="Filter by condition")
):
    """List all drugs with pharmacogenomic information. Public endpoint."""
```

#### 14. GET /api/v1/gma/ancestry-frequencies/{gene}

```python
@router.get("/ancestry-frequencies/{gene}", response_model=AncestryFrequencyResponse)
async def get_ancestry_frequencies(
    gene: str = Path(...),
    variant: str = Query(default=None)
):
    """Get allele frequencies across populations. Public endpoint."""
```

#### 15. POST /api/v1/gma/vcf/upload

```python
@router.post("/vcf/upload", response_model=VCFUploadResponse)
async def upload_vcf(
    file: UploadFile = File(...),
    patient_id: UUID = Form(...),
    test_provider: str = Form(default=None),
    current_user: User = Depends(get_current_user)
):
    """Upload and parse a VCF file to extract pharmacogenetic variants."""
```

#### 16. GET /api/v1/gma/health

```python
@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Service health check. Public endpoint, no auth required."""
```

---

## 6. Pydantic Models

### Model Summary Table

| # | Model | Fields | Purpose |
|---|-------|--------|---------|
| 1 | `GeneticAnalysisRequest` | 14 fields | Input for comprehensive genetic analysis |
| 2 | `GeneticAnalysisResponse` | 11 fields | Output containing all analysis results |
| 3 | `GeneticProfile` | 18 fields | Patient genetic profile storage |
| 4 | `MetabolizerResult` | 8 fields | Single-gene metabolizer phenotype result |
| 5 | `DrugInteraction` | 12 fields | Individual drug-gene interaction record |
| 6 | `PsychiatricPrediction` | 10 fields | Medication response prediction |
| 7 | `NeuromodulationPrediction` | 9 fields | rTMS/tDCS response prediction |
| 8 | `NutrigenomicsResult` | 11 fields | Nutritional genetics and methylation analysis |
| 9 | `ClinicalReport` | 15 fields | Generated report metadata and content |
| 10 | `EvidenceSource` | 8 fields | Evidence citation and grading |

### Model 1: GeneticAnalysisRequest

```python
class GeneticAnalysisRequest(BaseModel):
    """Input model for comprehensive genetic medication analysis."""
    
    patient_id: Optional[UUID] = Field(None, description="Patient UUID")
    genetic_data: GeneticDataInput = Field(..., description="Genetic variant data")
    current_medications: list[str] = Field(default=[], description="Current medication names")
    target_conditions: list[str] = Field(default=[], description="Target psychiatric/neurological conditions")
    considered_medications: list[str] = Field(default=[], description="Medications being considered")
    ancestry: str = Field(default="unknown", description="Patient genetic ancestry")
    analysis_modules: list[str] = Field(default=["metabolism", "psychiatric", "neuromodulation", "nutrigenomics"])
    include_pediatric: bool = Field(default=False)
    include_geriatric: bool = Field(default=False)
    include_pedigree: bool = Field(default=False)
    consent_confirmed: bool = Field(..., description="Patient consent confirmed")
    consent_date: Optional[date] = Field(None)
    consent_type: str = Field(default="pharmacogenomic_testing")
    requesting_clinician_id: Optional[UUID] = Field(None)
    analysis_context: str = Field(default="routine", enum=["routine", "urgent", "preoperative", "prenatal"])
    
    @field_validator("consent_confirmed")
    @classmethod
    def validate_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Patient consent must be confirmed before genetic analysis")
        return v
```

### Model 2: GeneticAnalysisResponse

```python
class GeneticAnalysisResponse(BaseModel):
    """Comprehensive output model for genetic medication analysis."""
    
    analysis_id: UUID = Field(..., description="Unique analysis identifier")
    patient_id: Optional[UUID] = Field(None)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    safety_banner: str = Field(default="Decision-support only. Requires clinician review.")
    safety_disclaimer: str = Field(default=SAFE_WORDING_DISCLAIMER)
    metabolism_results: list[MetabolizerResult] = Field(default=[])
    psychiatric_results: list[PsychiatricPrediction] = Field(default=[])
    neuromodulation_results: list[NeuromodulationPrediction] = Field(default=[])
    nutrigenomics_results: Optional[NutrigenomicsResult] = Field(None)
    drug_interactions: list[DrugInteraction] = Field(default=[])
    evidence_summary: EvidenceSummary = Field(...)
    safe_wording_applied: bool = Field(default=True)
    uncertainty_labels: list[str] = Field(default=[])
    population_context_note: Optional[str] = Field(None)
    pediatric_warnings: list[str] = Field(default=[])
    geriatric_warnings: list[str] = Field(default=[])
    clinician_review_required: bool = Field(default=True)
    audit_log_id: UUID = Field(...)
```

### Model 3: GeneticProfile

```python
class GeneticProfile(BaseModel):
    """Patient genetic profile for storage and retrieval."""
    
    profile_id: UUID = Field(default_factory=uuid4)
    patient_id: UUID = Field(...)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    test_provider: Optional[str] = Field(None, description="Lab that performed testing")
    test_date: Optional[date] = Field(None)
    test_methodology: str = Field(default="unknown", enum=["snp_array", "ngs_panel", "wgs", "pcr", "unknown"])
    cyp2d6_diplotype: Optional[str] = Field(None)
    cyp2c19_diplotype: Optional[str] = Field(None)
    cyp2b6_diplotype: Optional[str] = Field(None)
    cyp3a4_diplotype: Optional[str] = Field(None)
    cyp3a5_diplotype: Optional[str] = Field(None)
    cyp1a2_diplotype: Optional[str] = Field(None)
    variant_calls: dict[str, str] = Field(default={}, description="Additional variant calls")
    activity_scores: dict[str, float] = Field(default={})
    metabolizer_phenotypes: dict[str, str] = Field(default={})
    ancestry_estimate: Optional[str] = Field(None)
    vcf_file_path: Optional[str] = Field(None)
    raw_data_available: bool = Field(default=False)
    is_active: bool = Field(default=True)
```

### Model 4: MetabolizerResult

```python
class MetabolizerResult(BaseModel):
    """Single-gene metabolizer phenotype calculation result."""
    
    gene: str = Field(..., description="Gene symbol (e.g., CYP2D6)")
    diplotype: str = Field(..., description="Diplotype call (e.g., *1/*4)")
    activity_score: float = Field(..., description="CPIC activity score")
    phenotype: str = Field(..., description="Metabolizer phenotype classification")
    phenotype_category: str = Field(..., enum=["ultra_rapid", "rapid", "extensive", "intermediate", "poor", "indeterminate"])
    confidence: str = Field(default="high", enum=["high", "medium", "low", "indeterminate"])
    affected_drugs: list[DrugInteraction] = Field(default=[])
    evidence_grade: str = Field(..., enum=["A", "B", "C", "D"])
    cpic_guideline_url: Optional[str] = Field(None)
    clinical_implications: str = Field(...)
    safe_wording: str = Field(...)
    population_frequency: Optional[dict] = Field(None)
```

### Model 5: DrugInteraction

```python
class DrugInteraction(BaseModel):
    """Individual drug-gene interaction record with safety framing."""
    
    interaction_id: UUID = Field(default_factory=uuid4)
    drug_name: str = Field(...)
    drug_class: str = Field(...)
    gene: str = Field(...)
    variant: str = Field(...)
    severity: str = Field(..., enum=["major", "moderate", "minor", "beneficial", "informational"])
    severity_color: str = Field(..., enum=["red", "orange", "yellow", "green", "blue"])
    clinical_recommendation: str = Field(...)
    recommendation_category: str = Field(..., enum=["avoid", "consider_alternative", "adjust_dose", "monitor", "use_as_directed", "informational"])
    evidence_grade: str = Field(..., enum=["A", "B", "C", "D"])
    evidence_sources: list[EvidenceSource] = Field(default=[])
    mechanism: str = Field(..., description="Pharmacological mechanism")
    safe_wording: str = Field(...)
    fda_label_note: Optional[str] = Field(None)
    cpic_recommendation: Optional[str] = Field(None)
    affected_populations: list[str] = Field(default=[])
    research_only: bool = Field(default=False)
```

### Model 6: PsychiatricPrediction

```python
class PsychiatricPrediction(BaseModel):
    """Psychiatric medication response prediction based on pharmacogenetics."""
    
    prediction_id: UUID = Field(default_factory=uuid4)
    gene: str = Field(...)
    variant: str = Field(...)
    condition: str = Field(...)
    medication_class: str = Field(...)
    response_likelihood: str = Field(..., enum=["enhanced", "normal", "reduced", "uncertain"])
    confidence_level: str = Field(..., enum=["high", "moderate", "low", "very_low"])
    evidence_grade: str = Field(..., enum=["A", "B", "C", "D"])
    supporting_studies: list[EvidenceSource] = Field(default=[])
    clinical_implications: str = Field(...)
    safe_wording: str = Field(...)
    effect_size: Optional[str] = Field(None, description="Odds ratio or effect size from studies")
    population_specific_notes: Optional[str] = Field(None)
    research_only: bool = Field(default=False)
```

### Model 7: NeuromodulationPrediction

```python
class NeuromodulationPrediction(BaseModel):
    """Neuromodulation response prediction based on genetic profile."""
    
    prediction_id: UUID = Field(default_factory=uuid4)
    gene: str = Field(...)
    variant: str = Field(...)
    modality: str = Field(..., enum=["rtms", "tdcs", "tacs", "trns", "deep_tms"])
    target_condition: str = Field(...)
    response_prediction: str = Field(..., enum=["enhanced", "normal", "reduced", "contraindicated", "uncertain"])
    confidence_level: str = Field(..., enum=["high", "moderate", "low", "very_low"])
    evidence_grade: str = Field(..., enum=["A", "B", "C", "D"])
    supporting_studies: list[EvidenceSource] = Field(default=[])
    clinical_implications: str = Field(...)
    suggested_parameters: Optional[dict] = Field(None)
    safe_wording: str = Field(...)
    contraindication_warning: Optional[str] = Field(None)
    research_only: bool = Field(default=False)
```

### Model 8: NutrigenomicsResult

```python
class NutrigenomicsResult(BaseModel):
    """Nutrigenomics and methylation pathway analysis."""
    
    result_id: UUID = Field(default_factory=uuid4)
    patient_id: UUID = Field(...)
    mthfr_c677t_status: Optional[str] = Field(None)
    mthfr_a1298c_status: Optional[str] = Field(None)
    methylation_capacity: str = Field(..., enum=["optimal", "reduced", "significantly_reduced", "uncertain"])
    homocysteine_risk: str = Field(..., enum=["low", "moderate", "elevated", "high"])
    folate_recommendation: str = Field(...)
    b12_recommendation: str = Field(...)
    vitamin_d_recommendation: Optional[str] = Field(None)
    omega3_recommendation: Optional[str] = Field(None)
    apoe_status: Optional[str] = Field(None)
    cognitive_risk_notes: Optional[str] = Field(None)
    weight_management_genes: Optional[dict] = Field(None)
    clinical_actions: list[str] = Field(default=[])
    supplement_suggestions: list[dict] = Field(default=[])
    safe_wording: str = Field(...)
    evidence_grade: str = Field(..., enum=["A", "B", "C", "D"])
    research_only_sections: list[str] = Field(default=[])
```

### Model 9: ClinicalReport

```python
class ClinicalReport(BaseModel):
    """Generated clinical report metadata and content."""
    
    report_id: UUID = Field(default_factory=uuid4)
    analysis_id: UUID = Field(...)
    patient_id: UUID = Field(...)
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    generated_by: UUID = Field(...)
    report_format: str = Field(..., enum=["pdf", "html", "json"])
    report_type: str = Field(..., enum=["comprehensive", "metabolism_only", "psychiatric_only", "neuromodulation_only", "nutrigenomics_only", "summary"])
    patient_facing: bool = Field(default=False)
    language: str = Field(default="en")
    sections_included: list[str] = Field(default=[])
    metabolizer_summary: Optional[str] = Field(None)
    drug_interaction_summary: Optional[str] = Field(None)
    psychiatric_summary: Optional[str] = Field(None)
    neuromodulation_summary: Optional[str] = Field(None)
    nutrigenomics_summary: Optional[str] = Field(None)
    clinician_notes: Optional[str] = Field(None)
    safety_footer: str = Field(default=SAFE_WORDING_FOOTER)
    review_status: str = Field(default="pending_review", enum=["pending_review", "reviewed", "approved", "rejected"])
    reviewed_by: Optional[UUID] = Field(None)
    reviewed_at: Optional[datetime] = Field(None)
```

### Model 10: EvidenceSource

```python
class EvidenceSource(BaseModel):
    """Evidence citation and grading for clinical recommendations."""
    
    source_id: UUID = Field(default_factory=uuid4)
    database: str = Field(..., enum=["cpic", "pharmgkb", "fda", "dpwg", "cpnds", "pubmed", "cochrane", "custom"])
    citation_id: str = Field(..., description="Identifier in source database")
    title: str = Field(...)
    authors: list[str] = Field(default=[])
    publication_year: int = Field(...)
    journal: Optional[str] = Field(None)
    pmid: Optional[int] = Field(None)
    doi: Optional[str] = Field(None)
    evidence_level: str = Field(..., enum=["1A", "1B", "2A", "2B", "3", "4", "N/A"])
    clinical_significance: str = Field(..., enum=["high", "moderate", "low", "none", "not_stated"])
    url: Optional[str] = Field(None)
```

---

## 7. Frontend Modules

### Module Summary Table

| # | Module | Routes | Key Features | Lines |
|---|--------|--------|-------------|-------|
| 1 | **Dashboard Module** | `/gma`, `/gma/dashboard` | Overview cards, risk summary, recent analyses, quick actions | 412 |
| 2 | **Gene Browser Module** | `/gma/genes`, `/gma/genes/{gene}` | Interactive gene cards, variant visualization, population frequencies | 356 |
| 3 | **Drug Interaction Module** | `/gma/interactions`, `/gma/interactions/matrix` | Drug-gene matrix, severity visualization, filtering, export | 398 |
| 4 | **Metabolizer Module** | `/gma/metabolizer` | Phenotype calculator, activity score visualizer, drug impact cards | 287 |
| 5 | **Psychiatric Response Module** | `/gma/psychiatric` | Medication response predictions, gene cards, evidence display | 334 |
| 6 | **Neuromodulation Module** | `/gma/neuromodulation` | TMS/tDCS response predictions, parameter suggestions | 267 |
| 7 | **Nutrigenomics Module** | `/gma/nutrigenomics` | Methylation analysis, supplement recommendations | 290 |
| 8 | **Settings & Consent Module** | `/gma/settings`, `/gma/consent` | Consent management, ancestry settings, export preferences | 300 |
| | **TOTAL** | | | **2,644** |

### Module 1: Dashboard Module (412 lines)

**File:** `apps/web/src/gma/dashboard/GmaDashboardPage.tsx`  
**Route:** `/gma`  
**Lines:** 412

**Key Features:**
- Patient genetic profile summary card with phenotype badges
- Drug interaction risk summary with color-coded severity counts
- Metabolizer status overview (6 gene cards)
- Recent analysis history with quick-view
- Safety banner (persistent across all modules)
- Quick-action buttons for each analysis type
- Ancestry context indicator
- Evidence grade distribution chart
- Pending clinician review alerts

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| GmaDashboardPage | `GmaDashboardPage.tsx` | 412 | Main dashboard page |
| ProfileSummaryCard | `components/ProfileSummaryCard.tsx` | 68 | Genetic profile overview |
| RiskSummaryPanel | `components/RiskSummaryPanel.tsx` | 89 | Drug interaction risk counts |
| MetabolizerOverview | `components/MetabolizerOverview.tsx` | 76 | 6-gene phenotype badges |
| RecentAnalysisList | `components/RecentAnalysisList.tsx` | 94 | Analysis history |
| QuickActionBar | `components/QuickActionBar.tsx` | 45 | Quick navigation buttons |
| SafetyBanner | `components/SafetyBanner.tsx` | 40 | Persistent safety disclaimer |

**State Management:**
```typescript
interface DashboardState {
  profile: GeneticProfile | null;
  analyses: GeneticAnalysis[];
  drugInteractions: DrugInteraction[];
  metabolizerResults: MetabolizerResult[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}
```

### Module 2: Gene Browser Module (356 lines)

**File:** `apps/web/src/gma/gene-browser/GeneBrowserPage.tsx`  
**Route:** `/gma/genes`  
**Lines:** 356

**Key Features:**
- Searchable gene catalog (35+ genes)
- Gene detail view with variant cards
- Population frequency bar charts by ancestry
- Evidence grade badges per gene-drug pair
- CPIC guideline links
- Star allele reference tables
- Interactive diplotype simulator
- Gene pathway visualization

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| GeneBrowserPage | `GeneBrowserPage.tsx` | 356 | Main gene browser |
| GeneSearchBar | `components/GeneSearchBar.tsx` | 52 | Gene search with autocomplete |
| GeneCard | `components/GeneCard.tsx` | 78 | Individual gene summary card |
| GeneDetailView | `components/GeneDetailView.tsx` | 95 | Detailed gene information |
| PopulationFrequencyChart | `components/PopulationFrequencyChart.tsx` | 67 | Ancestry frequency visualization |
| StarAlleleTable | `components/StarAlleleTable.tsx` | 64 | Star allele reference |

### Module 3: Drug Interaction Module (398 lines)

**File:** `apps/web/src/gma/interactions/DrugInteractionPage.tsx`  
**Route:** `/gma/interactions`  
**Lines:** 398

**Key Features:**
- Drug-gene interaction matrix (interactive grid)
- Severity filtering (Major/Moderate/Minor/Beneficial/Info)
- Gene filter dropdown
- Drug class filter
- Color-coded severity indicators (Red/Orange/Yellow/Green/Blue)
- Detailed interaction cards with evidence
- CPIC recommendation display
- FDA label integration
- Export to PDF/CSV
- Print-friendly view

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| DrugInteractionPage | `DrugInteractionPage.tsx` | 398 | Main interaction page |
| InteractionMatrix | `components/InteractionMatrix.tsx` | 112 | Interactive grid |
| InteractionCard | `components/InteractionCard.tsx` | 87 | Individual interaction detail |
| SeverityFilter | `components/SeverityFilter.tsx` | 45 | Filter controls |
| GeneDrugSearch | `components/GeneDrugSearch.tsx` | 56 | Search interface |
| ExportPanel | `components/ExportPanel.tsx` | 52 | Export controls |
| EvidenceBadge | `components/EvidenceBadge.tsx` | 46 | Evidence grade display |

### Module 4: Metabolizer Module (287 lines)

**File:** `apps/web/src/gma/metabolizer/MetabolizerPage.tsx`  
**Route:** `/gma/metabolizer`  
**Lines:** 287

**Key Features:**
- Metabolizer phenotype calculator
- Activity score visual gauge
- Gene-by-gene phenotype cards
- Drug impact table per phenotype
- CPIC guideline summaries
- Phenotype distribution in population
- Printable metabolizer card

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| MetabolizerPage | `MetabolizerPage.tsx` | 287 | Main metabolizer page |
| PhenotypeCalculator | `components/PhenotypeCalculator.tsx` | 78 | Diplotype input & calculation |
| ActivityScoreGauge | `components/ActivityScoreGauge.tsx` | 56 | Visual score indicator |
| PhenotypeCard | `components/PhenotypeCard.tsx` | 67 | Individual phenotype display |
| DrugImpactTable | `components/DrugImpactTable.tsx` | 86 | Drug recommendations per phenotype |

### Module 5: Psychiatric Response Module (334 lines)

**File:** `apps/web/src/gma/psychiatric/PsychiatricPage.tsx`  
**Route:** `/gma/psychiatric`  
**Lines:** 334

**Key Features:**
- Condition selector (MDD, bipolar, schizophrenia, ADHD, anxiety, PTSD)
- Medication class selector
- Gene-based response prediction cards
- Evidence strength visualization
- Response likelihood indicators
- Gene variant detail panels
- Study reference lists
- Uncertainty label display

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| PsychiatricPage | `PsychiatricPage.tsx` | 334 | Main psychiatric page |
| ConditionSelector | `components/ConditionSelector.tsx` | 54 | Condition dropdown |
| MedicationClassSelector | `components/MedicationClassSelector.tsx` | 48 | Medication class tabs |
| ResponsePredictionCard | `components/ResponsePredictionCard.tsx` | 89 | Prediction display |
| GeneVariantPanel | `components/GeneVariantPanel.tsx` | 76 | Variant detail panel |
| EvidenceDisplay | `components/EvidenceDisplay.tsx` | 67 | Evidence visualization |

### Module 6: Neuromodulation Module (267 lines)

**File:** `apps/web/src/gma/neuromodulation/NeuromodulationPage.tsx`  
**Route:** `/gma/neuromodulation`  
**Lines:** 267

**Key Features:**
- Modality selector (rTMS, tDCS, tACS, tRNS, deep TMS)
- Condition-target mapping
- Gene response prediction cards
- Suggested parameter ranges
- Contraindication warnings
- Evidence level indicators
- Protocol Hub integration button

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| NeuromodulationPage | `NeuromodulationPage.tsx` | 267 | Main neuromodulation page |
| ModalitySelector | `components/ModalitySelector.tsx` | 56 | Modality selection tabs |
| ResponsePredictionCard | `components/ResponsePredictionCard.tsx` | 78 | Gene-based prediction |
| ParameterSuggestion | `components/ParameterSuggestion.tsx` | 67 | Parameter range display |
| ContraindicationAlert | `components/ContraindicationAlert.tsx` | 45 | Warning display |
| ProtocolHubLink | `components/ProtocolHubLink.tsx` | 21 | Integration button |

### Module 7: Nutrigenomics Module (290 lines)

**File:** `apps/web/src/gma/nutrigenomics/NutrigenomicsPage.tsx`  
**Route:** `/gma/nutrigenomics`  
**Lines:** 290

**Key Features:**
- MTHFR variant display (C677T + A1298C)
- Methylation pathway visualization
- Homocysteine risk indicator
- Supplement recommendation cards
- Folate/B12/Vitamin D status panels
- Omega-3 recommendation
- APOE cognitive risk panel (if available)
- Weight management genetics
- Personalized nutrition plan

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| NutrigenomicsPage | `NutrigenomicsPage.tsx` | 290 | Main nutrigenomics page |
| MthfrPanel | `components/MthfrPanel.tsx` | 87 | MTHFR variant display |
| MethylationVisualizer | `components/MethylationVisualizer.tsx` | 67 | Pathway diagram |
| SupplementCard | `components/SupplementCard.tsx` | 56 | Recommendation cards |
| HomocysteineIndicator | `components/HomocysteineIndicator.tsx` | 45 | Risk level display |
| NutritionPlan | `components/NutritionPlan.tsx` | 35 | Personalized plan |

### Module 8: Settings & Consent Module (300 lines)

**File:** `apps/web/src/gma/settings/GmaSettingsPage.tsx`  
**Route:** `/gma/settings`  
**Lines:** 300

**Key Features:**
- Patient consent management
- Consent history and audit trail
- Ancestry self-identification
- Genetic test provider selection
- Data export preferences
- Report language selection
- Clinician notification preferences
- Privacy settings
- Data retention preferences

**Sub-Components:**

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| GmaSettingsPage | `GmaSettingsPage.tsx` | 300 | Main settings page |
| ConsentManager | `components/ConsentManager.tsx` | 89 | Consent CRUD operations |
| AncestrySelector | `components/AncestrySelector.tsx` | 56 | Ancestry identification |
| ExportPreferences | `components/ExportPreferences.tsx` | 45 | Export settings |
| PrivacySettings | `components/PrivacySettings.tsx` | 67 | Privacy controls |
| NotificationPrefs | `components/NotificationPrefs.tsx` | 43 | Notification settings |

---

## 8. Gene Coverage Matrix

### Comprehensive Gene Coverage

| Gene | Full Name | Variants Covered | Drug Classes | Evidence Grade | CPIC Guideline |
|------|-----------|-----------------|-------------|---------------|---------------|
| **CYP2D6** | Cytochrome P450 2D6 | *1, *2, *3, *4, *5, *6, *9, *10, *14, *17, *29, *41, CNV | SSRIs, TCAs, antipsychotics, opioids, beta-blockers, antiemetics | A (Strong) | Yes -- Published |
| **CYP2C19** | Cytochrome P450 2C19 | *1, *2, *3, *4, *5, *6, *7, *8, *9, *10, *17, CNV | Clopidogrel, PPIs, TCAs, diazepam, citalopram, voriconazole | A (Strong) | Yes -- Published |
| **CYP2B6** | Cytochrome P450 2B6 | *4, *5, *6, *7, *9, *16, *18, *19 | Bupropion, efavirenz, cyclophosphamide, methadone | B (Moderate) | Yes -- Published |
| **CYP3A4** | Cytochrome P450 3A4 | *2, *3, *4, *5, *6, *17, *18, *20, *22 | Atorvastatin, tacrolimus, midazolam, fentanyl, cyclosporine | B (Moderate) | In Development |
| **CYP3A5** | Cytochrome P450 3A5 | *3, *6, *7 | Tacrolimus, cyclosporine, simvastatin | A (Strong) | Yes -- Published |
| **CYP1A2** | Cytochrome P450 1A2 | *1C, *1D, *1F, *1K | Clozapine, olanzapine, caffeine, theophylline | C (Optional) | In Development |
| **SLC6A4** | Serotonin Transporter | 5-HTTLPR (L/S), rs25531, STin2 VNTR | SSRIs, SNRIs | B (Moderate) | No |
| **HTR2A** | Serotonin 2A Receptor | rs7997012, rs6311, rs6313, rs6314 | SSRIs, atypical antipsychotics | B (Moderate) | No |
| **HTR2C** | Serotonin 2C Receptor | rs3813929, rs518147, rs1414334 | Atypical antipsychotics, SSRIs | B (Moderate) | No |
| **COMT** | Catechol-O-Methyltransferase | Val158Met (rs4680), rs737865, rs165599 | Antidepressants, antipsychotics, pain medications | B (Moderate) | No |
| **DRD2** | Dopamine D2 Receptor | Taq1A (rs1800497), -141C Ins/Del (rs1799732) | Antipsychotics, antiparkinsonian | B (Moderate) | No |
| **ADRA2A** | Alpha-2A Adrenergic Receptor | rs1800544, rs1800035 | Guanfacine, clonidine, dexmedetomidine | C (Optional) | No |
| **HTR1A** | Serotonin 1A Receptor | rs6295 | Buspirone, SSRIs, pindolol | C (Optional) | No |
| **BDNF** | Brain-Derived Neurotrophic Factor | Val66Met (rs6265), rs2030324, rs7124442 | rTMS response, antidepressant response | B (Moderate) | No |
| **GRIK4** | Glutamate Ionotropic Receptor Kainate Type Subunit 4 | rs1954787, rs11218030 | rTMS response, antidepressant augmentation | B (Moderate) | No |
| **CACNA1C** | Calcium Voltage-Gated Channel Subunit Alpha1 C | rs1006737, rs2159100 | tDCS response, mood stabilizers | C (Optional) | No |
| **ANK3** | Ankyrin 3 | rs10994336, rs1938526 | TMS response in bipolar disorder | C (Optional) | No |
| **SCN1A** | Sodium Voltage-Gated Channel Alpha Subunit 1 | Multiple rare variants | tDCS contraindication | A (Strong) | Yes -- Epilepsy |
| **KCNQ2** | Potassium Voltage-Gated Channel Subfamily Q Member 2 | Multiple rare variants | tDCS excitability thresholds | D (Emerging) | No |
| **MTHFR** | Methylenetetrahydrofolate Reductase | C677T (rs1801133), A1298C (rs1801131) | L-methylfolate, antidepressant augmentation | A (Strong) | No (Clinical practice) |
| **VDR** | Vitamin D Receptor | BsmI (rs1544410), FokI (rs2228570), TaqI (rs731236) | Vitamin D3 supplementation | B (Moderate) | No |
| **FTO** | Fat Mass and Obesity Associated | rs9939609, rs1421085 | Weight management, metformin | B (Moderate) | No |
| **APOE** | Apolipoprotein E | e2/e3/e4 (rs429358, rs7412) | Omega-3 DHA, cognitive protection | B (Moderate) | No |
| **MTR** | 5-Methyltetrahydrofolate-Homocysteine Methyltransferase | A2756G (rs1805087) | B12, methylation support | C (Optional) | No |
| **MTRR** | Methionine Synthase Reductase | A66G (rs1801394) | B12, folate adequacy | C (Optional) | No |
| **TCN2** | Transcobalamin 2 | C776G (rs1801198) | B12 transport adequacy | C (Optional) | No |
| **FADS1** | Fatty Acid Desaturase 1 | rs174537, rs174546, rs174575 | Omega-3 conversion efficiency | C (Optional) | No |
| **FADS2** | Fatty Acid Desaturase 2 | rs174575, rs2727270 | Omega-3 conversion efficiency | C (Optional) | No |
| **ABCB1** | ATP-Binding Cassette Subfamily B Member 1 | C3435T (rs1045642), G2677T/A | Treatment-resistant depression | C (Optional) | No |
| **GNB3** | G Protein Subunit Beta 3 | C825T (rs5443) | Mirtazapine response, obesity | C (Optional) | No |
| **FKBP5** | FKBP Prolyl Isomerase 5 | rs1360780, rs3800373 | PTSD, antidepressant response | C (Optional) | No |
| **NTRK2** | Neurotrophic Receptor Tyrosine Kinase 2 | rs1439050 | Neuroplasticity, tDCS response | D (Emerging) | No |
| **OPRM1** | Opioid Receptor Mu 1 | A118G (rs1799971) | Opioid analgesia, naltrexone response | B (Moderate) | No |
| **HLA-B** | Human Leukocyte Antigen B | *15:02, *57:01 | Carbamazepine SJS/TEN, abacavir hypersensitivity | A (Strong) | Yes -- Published |
| **DPYD** | Dihydropyrimidine Dehydrogenase | *2A, *13, c.2846A>T | Fluoropyrimidine toxicity | A (Strong) | Yes -- Published |
| **TPMT** | Thiopurine S-Methyltransferase | *2, *3A, *3C | Thiopurine toxicity | A (Strong) | Yes -- Published |
| **NUDT15** | Nudix Hydrolase 15 | *2, *3, *4, *5 | Thiopurine toxicity (Asian populations) | A (Strong) | Yes -- Published |

### Gene Coverage by Domain

| Domain | Gene Count | CPIC Guidelines | FDA Labels |
|--------|-----------|----------------|------------|
| CYP450 Metabolism | 6 | 4 published, 2 in development | 6 genes with FDA labels |
| Psychiatric Response | 9 | 0 (research-grade) | 0 direct labels |
| Neuromodulation Response | 6 | 1 (SCN1A -- epilepsy) | 1 indirect label |
| Nutrigenomics/Methylation | 10 | 0 (clinical practice) | 0 direct labels |
| Additional Pharmacogenes | 5 | 3 published (HLA-B, DPYD, TPMT, NUDT15) | 4 with FDA labels |
| **TOTAL** | **36** | **8 published, 2 in development** | **11 with FDA labels** |

---

## 9. Drug Interaction Matrix

### Severity Classification System

| Severity Level | Color Code | Count | Clinical Action | Icon |
|---------------|-----------|-------|----------------|------|
| **Major** | Red (#DC2626) | 42 | Action required -- consider alternative therapy | Octagon |
| **Moderate** | Orange (#F97316) | 68 | Consider alternative or enhanced monitoring | Triangle |
| **Minor** | Yellow (#EAB308) | 124 | Monitor -- clinical significance uncertain | Circle |
| **Beneficial** | Green (#22C55E) | 35 | Potentially advantageous interaction | Checkmark |
| **Informational** | Blue (#3B82F6) | 156 | For reference -- research-grade evidence | Info |

### Major Interactions (Red -- Action Required)

| Gene | Phenotype | Drug | Clinical Recommendation | Evidence | CPIC |
|------|-----------|------|------------------------|----------|------|
| CYP2D6 | PM | Codeine | Avoid -- no morphine production | 1A | Yes |
| CYP2D6 | PM | Tamoxifen | Avoid -- no endoxifen production | 1A | Yes |
| CYP2D6 | UM | Codeine | Avoid -- excessive morphine production | 1A | Yes |
| CYP2D6 | UM | Nortriptyline | Avoid -- subtherapeutic levels | 1A | Yes |
| CYP2C19 | PM | Clopidogrel | Avoid -- no active metabolite | 1A | Yes |
| CYP2C19 | UM | Voriconazole | Avoid -- subtherapeutic levels | 1A | Yes |
| CYP2C19 | UM | Citalopram | Use with caution -- increased metabolism | 1B | Yes |
| HLA-B | *15:02 | Carbamazepine | Avoid -- SJS/TEN risk | 1A | Yes |
| HLA-B | *57:01 | Abacavir | Contraindicated -- hypersensitivity | 1A | Yes |
| DPYD | *2A/*13 | Fluorouracil | Avoid -- fatal toxicity risk | 1A | Yes |
| TPMT | *2/*3A | Azathioprine | Avoid -- severe myelosuppression | 1A | Yes |
| NUDT15 | *2/*3 | Azathioprine | Reduce dose -- severe leukopenia | 1A | Yes |
| CYP3A5 | Non-expresser | Tacrolimus | Use standard dosing | 1A | Yes |

### Moderate Interactions (Orange -- Consider Alternative)

| Gene | Phenotype | Drug | Clinical Recommendation | Evidence |
|------|-----------|------|------------------------|----------|
| CYP2D6 | IM | Metoprolol | Consider lower starting dose | 1B |
| CYP2D6 | IM | Atomoxetine | Consider lower dose or alternative | 1B |
| CYP2D6 | IM | Nortriptyline | Consider 50% dose reduction | 1A |
| CYP2D6 | IM | Venlafaxine | Consider alternative | 2B |
| CYP2C19 | IM | Citalopram | Consider 50% max dose (QT risk) | 1B |
| CYP2C19 | IM | Escitalopram | Consider 50% max dose | 1B |
| CYP2C19 | IM | Diazepam | Start with lowest dose | 2B |
| CYP2B6 | Slow | Bupropion | Consider dose adjustment | 2B |
| CYP2B6 | Slow | Efavirenz | Increased CNS side effects | 2B |
| CYP1A2 | Slow | Clozapine | Consider lower dose | 3 |
| CYP1A2 | Slow | Olanzapine | Monitor levels | 3 |
| CYP3A4 | Poor | Atorvastatin | Consider lower dose | 2B |
| ABCB1 | 3435TT | Escitalopram | May require higher dose | 2B |

### Drug Class Coverage

| Drug Class | # of Drugs | # of Gene Interactions | Highest Severity | Key Genes |
|-----------|-----------|----------------------|-----------------|-----------|
| SSRIs | 8 | 47 | Major | CYP2D6, CYP2C19, SLC6A4, HTR2A |
| SNRIs | 5 | 23 | Moderate | CYP2D6, SLC6A4, COMT |
| TCAs | 7 | 38 | Major | CYP2D6, CYP2C19 |
| Atypical Antipsychotics | 10 | 45 | Major | CYP2D6, CYP3A4, DRD2, HTR2C |
| Typical Antipsychotics | 5 | 18 | Major | CYP2D6, DRD2 |
| Mood Stabilizers | 6 | 22 | Major | HLA-B, CACNA1C |
| Stimulants | 4 | 12 | Moderate | ADRA2A, CYP2D6 |
| Opioids | 8 | 28 | Major | CYP2D6, OPRM1 |
| Benzodiazepines | 6 | 15 | Moderate | CYP2C19, CYP3A4 |
| Beta-Blockers | 5 | 14 | Moderate | CYP2D6 |
| Anticonvulsants | 8 | 25 | Major | HLA-B, SCN1A, CYP2C9 |
| Immunosuppressants | 4 | 12 | Major | CYP3A5, TPMT, NUDT15 |
| PPIs | 5 | 14 | Major | CYP2C19 |
| Antiemetics | 4 | 10 | Major | CYP2D6 |
| Statins | 4 | 11 | Moderate | CYP3A4, SLCO1B1 |
| **TOTAL** | **94** | **334** | | |

---

## 10. Metabolizer Phenotypes

### CYP2D6 Metabolizer Phenotypes

| Phenotype | Activity Score | Population % (European) | Population % (African) | Population % (East Asian) |
|-----------|---------------|------------------------|----------------------|-------------------------|
| Ultra-Rapid Metabolizer (UM) | >2.0 | 5-10% | 1-3% | 1-2% |
| Normal Metabolizer (NM/EM) | 1.0-2.0 | 70-80% | 80-90% | 85-90% |
| Intermediate Metabolizer (IM) | 0.25-0.75 | 10-15% | 5-10% | 5-10% |
| Poor Metabolizer (PM) | 0 | 6-8% | 1-3% | 0-1% |

### CYP2D6 Clinical Impact by Phenotype

| Drug | UM | NM | IM | PM | Evidence |
|------|-----|-----|-----|-----|----------|
| Codeine | Toxicity risk (avoid) | Normal effect | Reduced effect | No effect (avoid) | A |
| Tramadol | Enhanced effect | Normal effect | Reduced effect | Reduced effect | A |
| Tamoxifen | Enhanced activation | Normal | Reduced endoxifen | No activation (avoid) | A |
| Nortriptyline | Subtherapeutic | Normal | 50% dose reduction | 50% dose or avoid | A |
| Atomoxetine | Subtherapeutic | Normal | Consider lower dose | Consider lower dose | A |
| Metoprolol | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Fluoxetine | Normal | Normal | Increased levels | Increased levels | B |
| Paroxetine | Normal | Normal | Increased levels | Increased levels | B |
| Venlafaxine | Subtherapeutic | Normal | Altered ratio | Altered ratio | B |
| Risperidone | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Haloperidol | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Aripiprazole | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Ondansetron | Reduced effect | Normal | Increased levels | Increased levels | B |

### CYP2C19 Metabolizer Phenotypes

| Phenotype | Activity Score | Population % (European) | Population % (East Asian) | Population % (African) |
|-----------|---------------|------------------------|-------------------------|----------------------|
| Ultra-Rapid Metabolizer (UM) | >2.0 | ~2% | ~4% | ~2% |
| Rapid Metabolizer (RM) | 1.5-2.0 | 15-20% | 15-20% | 15-25% |
| Normal Metabolizer (NM) | 1.0-1.5 | 60-70% | 50-60% | 50-60% |
| Intermediate Metabolizer (IM) | 0.25-0.75 | 10-15% | 15-20% | 10-15% |
| Poor Metabolizer (PM) | 0 | 2-3% | 13-15% | 1-4% |

### CYP2C19 Clinical Impact by Phenotype

| Drug | UM/RM | NM | IM | PM | Evidence |
|------|--------|-----|-----|-----|----------|
| Clopidogrel | Normal activation | Normal | Reduced activation | No activation (avoid) | A |
| Voriconazole | Subtherapeutic | Normal | Increased levels | Increased levels (avoid) | A |
| Citalopram | Subtherapeutic | Normal | Increased levels (50% max) | Increased levels (50% max) | A |
| Escitalopram | Subtherapeutic | Normal | Increased levels (50% max) | Increased levels (50% max) | A |
| Diazepam | Subtherapeutic | Normal | Increased sedation | Increased sedation | B |
| Amitriptyline | Subtherapeutic | Normal | 50% dose reduction | 50% dose or avoid | B |
| Clomipramine | Subtherapeutic | Normal | 50% dose reduction | 50% dose or avoid | B |
| Omeprazole | Subtherapeutic | Normal | Increased effect | Increased effect | B |
| Sertraline | Subtherapeutic | Normal | Increased levels | Increased levels | C |

### CYP2B6 Metabolizer Phenotypes

| Phenotype | Activity Score | Population % (Global) | Clinical Impact |
|-----------|---------------|----------------------|-----------------|
| Slow Metabolizer | 0-0.5 | ~5-10% | Increased drug levels |
| Intermediate Metabolizer | 0.75-1.25 | ~15-25% | Mildly increased levels |
| Normal Metabolizer | 1.5-2.0 | ~50-60% | Normal drug levels |
| Ultra-Rapid Metabolizer | >2.0 | ~5-10% | Subtherapeutic levels |

### CYP2B6 Clinical Impact

| Drug | Slow | Intermediate | Normal | Ultra-Rapid | Evidence |
|------|------|-------------|--------|-------------|----------|
| Bupropion | Increased levels | Normal | Normal | Subtherapeutic | B |
| Efavirenz | Increased CNS effects | Mild increase | Normal | Subtherapeutic | B |
| Cyclophosphamide | Reduced activation | Normal | Normal | Enhanced activation | C |
| Methadone | Increased sedation | Normal | Normal | Subtherapeutic | C |

### CYP3A4/5 Metabolizer Phenotypes

| Gene | Phenotype | Population % | Clinical Impact |
|------|-----------|-------------|-----------------|
| CYP3A4 | Poor Metabolizer | ~1-5% | Significantly increased substrate levels |
| CYP3A4 | Intermediate | ~10-15% | Mildly increased levels |
| CYP3A4 | Normal | ~80-85% | Standard metabolism |
| CYP3A5 | Expresser (*1/*1, *1/*3) | ~60-80% (African), ~15-30% (European) | Active CYP3A5 enzyme |
| CYP3A5 | Non-Expresser (*3/*3) | ~85% (European), ~20-40% (African) | No CYP3A5 activity |

### CYP3A4/5 Clinical Impact

| Drug | CYP3A4 Poor | CYP3A5 Non-Expresser | Evidence |
|------|------------|---------------------|----------|
| Tacrolimus | Increased levels (consider lower dose) | Requires higher starting dose | A |
| Cyclosporine | Increased levels | Minimal impact | B |
| Atorvastatin | Increased myopathy risk | Minimal impact | B |
| Midazolam | Prolonged sedation | Minimal impact | B |
| Simvastatin | Increased myopathy risk | Minimal impact | B |

### CYP1A2 Phenotypes

| Phenotype | Inducibility | Population % | Clinical Impact |
|-----------|-------------|-------------|-----------------|
| Slow Inducer (*1F/*1F) | Low | ~45% (varies by population) | Higher drug levels |
| Fast Inducer (*1A/*1A, *1C/*1C) | High | ~55% | Lower baseline levels, more affected by smoking |

### CYP1A2 Clinical Impact

| Drug | Slow Inducer | Fast Inducer | Evidence |
|------|-------------|-------------|----------|
| Clozapine | Higher levels, monitor | Lower levels, affected by smoking | C |
| Olanzapine | Higher levels | Lower levels, affected by smoking | C |
| Caffeine | Slow clearance | Fast clearance | C |
| Theophylline | Higher levels | Lower levels | C |

---

## 11. Neuromodulation Genetics

### Neuromodulation Response Genetics Overview

| Gene | Variant | rTMS Response | tDCS Response | Deep TMS | tACS/tRNS | Evidence Grade |
|------|---------|--------------|---------------|----------|-----------|---------------|
| **BDNF** | Val66Met (rs6265) | Met = 30% lower response | Val carriers may respond better | Similar to rTMS | Emerging | B |
| **GRIK4** | rs1954787 | G allele = better response | Not studied | Not studied | Not studied | B |
| **CACNA1C** | rs1006737 | A allele = better response | A allele = enhanced cognitive | Not studied | Not studied | C |
| **ANK3** | rs10994336 | C allele = better TMS in BD | Not studied | Not studied | Not studied | C |
| **SCN1A** | Multiple rare | Contraindicated if pathogenic | Contraindicated if pathogenic | Contraindicated | Contraindicated | A |
| **KCNQ2** | Multiple rare | Affects excitability | Affects excitability | Not studied | Not studied | D |
| **5-HTTLPR** | L/S | L carriers = better combined Tx | L carriers = enhanced synergy | Not studied | Not studied | C |
| **NTRK2** | rs1439050 | Emerging -- plasticity marker | Emerging | Not studied | Not studied | D |
| **COMT** | Val158Met | Met = better cognitive effect | Val = better motor learning | Not studied | Not studied | C |
| **BDNF x 5-HTTLPR** | Combined | L/Val = best responders | Not studied | Not studied | Not studied | C |

### rTMS Response Predictions by Gene

| Gene | Genotype | MDD Response Prediction | OCD Response Prediction | Pain Response Prediction | Confidence |
|------|----------|------------------------|------------------------|-------------------------|------------|
| BDNF | Val/Val | Enhanced | Normal | Normal | Moderate |
| BDNF | Val/Met | Normal | Normal | Normal | High |
| BDNF | Met/Met | Reduced (~30% lower) | Reduced | Reduced | Moderate |
| GRIK4 | G/G | Enhanced | Not studied | Not studied | Moderate |
| GRIK4 | G/T | Normal | Not studied | Not studied | Moderate |
| GRIK4 | T/T | Reduced | Not studied | Not studied | Low |
| CACNA1C | A/A | Enhanced | Not studied | Not studied | Low |
| CACNA1C | A/G | Normal | Not studied | Not studied | Low |
| CACNA1C | G/G | Normal | Not studied | Not studied | Low |
| ANK3 | C/C | Enhanced (bipolar) | Not studied | Not studied | Low |
| COMT | Met/Met | Enhanced (cognitive) | Not studied | Not studied | Low |

### tDCS Response Predictions by Gene

| Gene | Genotype | Depression Response | Cognitive Enhancement | Motor Learning | Confidence |
|------|----------|-------------------|----------------------|----------------|------------|
| BDNF | Val/Val | Normal | Enhanced | Enhanced | Moderate |
| BDNF | Val/Met | Normal | Normal | Normal | High |
| BDNF | Met/Met | Reduced | Reduced | Reduced | Moderate |
| CACNA1C | A/A | Emerging | Enhanced | Not studied | Low |
| COMT | Val/Val | Normal | Normal | Enhanced | Moderate |
| COMT | Val/Met | Normal | Normal | Normal | Moderate |
| COMT | Met/Met | Normal | Enhanced | Reduced | Moderate |
| 5-HTTLPR | L/L | Enhanced (with SSRI) | Not studied | Not studied | Low |
| 5-HTTLPR | L/S | Normal | Not studied | Not studied | Low |
| 5-HTTLPR | S/S | Reduced (with SSRI) | Not studied | Not studied | Low |

### Contraindications for Neuromodulation

| Gene | Variant | Contraindication | Severity | Evidence |
|------|---------|-----------------|----------|----------|
| SCN1A | Pathogenic/likely pathogenic | All transcranial stimulation | Absolute | A |
| SCN2A | Pathogenic/likely pathogenic | All transcranial stimulation | Absolute | B |
| KCNQ2 | Pathogenic/likely pathogenic | tDCS, tACS with high intensity | Relative | D |
| Any epilepsy gene | Known seizure threshold variant | High-frequency rTMS | Relative | B |
| HLA-B | *15:02 | Not applicable (medication) | N/A | N/A |

### Neuromodulation Parameter Suggestions

| Gene Profile | rTMS Protocol Suggestion | tDCS Protocol Suggestion | Confidence |
|-------------|-------------------------|-------------------------|------------|
| BDNF Val/Val | Standard 10Hz DLPFC | 2 mA, 20 min, F3 anode | High |
| BDNF Met/Met | Consider higher intensity or iTBS | 1.5-2 mA, 20 min, F3 anode | Moderate |
| GRIK4 G/G | Standard protocol | Standard protocol | Moderate |
| GRIK4 T/T | May need more sessions | Consider extended protocol | Low |
| COMT Met/Met | Standard 10Hz DLPFC | 2 mA for cognitive enhancement | Low |
| CACNA1C A/A | Emerging -- standard recommended | 2 mA, cognitive montage | Low |

---

## 12. Nutrigenomics Panel

### Methylation Pathway Analysis

| Gene | Variant | Genotype | Methylation Impact | Clinical Action | Evidence |
|------|---------|----------|-------------------|----------------|----------|
| **MTHFR** | C677T | C/C (wildtype) | Normal | Standard folate intake | A |
| **MTHFR** | C677T | C/T (heterozygous) | ~30% reduced enzyme activity | Consider L-methylfolate 400-800 mcg | A |
| **MTHFR** | C677T | T/T (homozygous) | ~60-70% reduced enzyme activity | L-methylfolate 800-1000 mcg, monitor homocysteine | A |
| **MTHFR** | A1298C | A/A (wildtype) | Normal | Standard folate intake | B |
| **MTHFR** | A1298C | A/C (heterozygous) | ~15-20% reduced | Consider methylated B vitamins | B |
| **MTHFR** | A1298C | C/C (homozygous) | ~30-40% reduced | L-methylfolate 400-800 mcg | B |
| **MTHFR** | Compound | 677T/1298C | Significantly impaired | L-methylfolate 1000+ mcg, SAMe consideration | B |
| **MTR** | A2756G | A/A | Normal | Adequate B12 | C |
| **MTR** | A2756G | A/G or G/G | Reduced methionine synthase | Ensure B12 >400 pg/mL | C |
| **MTRR** | A66G | A/A | Normal | Adequate B12 | C |
| **MTRR** | A66G | A/G or G/G | Reduced reductase | Ensure B12 >400 pg/mL | C |
| **COMT** | Val158Met | Val/Val (GG) | Fast methylation, high dopamine clearance | SAMe may cause irritability | C |
| **COMT** | Val158Met | Val/Met (AG) | Intermediate | Standard methyl support | C |
| **COMT** | Val158Met | Met/Met (AA) | Slow methylation, low dopamine clearance | Caution with methyl donors | C |

### Homocysteine Risk Stratification

| Risk Profile | Genotype Combination | Estimated Risk | Action |
|-------------|---------------------|---------------|--------|
| Low | MTHFR 677CC + 1298AA + MTR AA + MTRR AA | Low | Standard nutrition |
| Low-Moderate | MTHFR 677CT + 1298AA | Low-Moderate | Consider methylfolate 400 mcg |
| Moderate | MTHFR 677TT or 1298CC | Moderate | L-methylfolate 800 mcg, check homocysteine |
| Moderate-High | MTHFR 677CT + 1298AC | Moderate-High | L-methylfolate 800-1000 mcg, B complex |
| High | MTHFR 677TT + 1298CC or compound heterozygous | High | L-methylfolate 1000+ mcg, B12, B6, monitor homocysteine |

### Vitamin D Genetics

| Gene | Variant | Genotype | Vitamin D Status Impact | Recommendation | Evidence |
|------|---------|----------|------------------------|----------------|----------|
| **VDR** | BsmI (rs1544410) | BB | Lower receptor efficiency | Higher D3 dose (2000-4000 IU) | B |
| **VDR** | BsmI | Bb | Intermediate | Standard to higher dose (1000-2000 IU) | B |
| **VDR** | BsmI | bb | Normal receptor | Standard dose (1000-2000 IU) | B |
| **VDR** | FokI (rs2228570) | FF | Normal receptor | Standard dose | B |
| **VDR** | FokI | Ff | Slightly reduced | Standard to higher dose | B |
| **VDR** | FokI | ff | Reduced receptor activity | Higher D3 dose (2000-4000 IU) | B |
| **VDR** | TaqI (rs731236) | TT | Normal | Standard dose | B |
| **VDR** | TaqI | Tt | Intermediate | Standard dose | B |
| **VDR** | TaqI | tt | Lower transcription | Higher D3 dose | B |
| **GC** | rs2282679 | AA | Normal D-binding protein | Standard dose | C |
| **GC** | rs2282679 | AC | Intermediate | Standard dose | C |
| **GC** | rs2282679 | CC | Lower D-binding | Higher D3 dose | C |

### Omega-3 Genetics

| Gene | Variant | Genotype | Conversion Efficiency | Recommendation | Evidence |
|------|---------|----------|---------------------|----------------|----------|
| **FADS1** | rs174537 | GG | High (ALA to EPA/DHA) | Plant-based omega-3 acceptable | C |
| **FADS1** | rs174537 | GT | Intermediate | Mixed sources | C |
| **FADS1** | rs174537 | TT | Low | Prioritize preformed EPA/DHA (fish/krill) | C |
| **FADS2** | rs174575 | GG | High | Plant-based acceptable | C |
| **FADS2** | rs174575 | AG | Intermediate | Mixed sources | C |
| **FADS2** | rs174575 | AA | Low | Preformed EPA/DHA recommended | C |
| **APOE** | e2/e2 | | Enhanced DHA uptake | DHA beneficial | B |
| **APOE** | e3/e3 | | Normal | Standard omega-3 | B |
| **APOE** | e4/e4 or e3/e4 | | Impaired DHA transport | Higher DHA (1000-2000 mg), combine with phosphatidylserine | B |

### APOE Cognitive Risk & Nutrition

| Genotype | Alzheimer's Risk | Omega-3 Priority | Additional Recommendations | Evidence |
|----------|-----------------|-----------------|----------------------------|----------|
| e2/e2 | Reduced | Moderate | Monitor cholesterol (Type III hyperlipoproteinemia risk) | B |
| e2/e3 | Slightly reduced | Moderate | Monitor lipids | B |
| e3/e3 | Baseline | Standard | Standard cognitive protection | B |
| e3/e4 | 3-4x increased | High | DHA 1000+ mg, Mediterranean diet, exercise, sleep | B |
| e4/e4 | 12-15x increased | Very High | DHA 2000+ mg, strict Mediterranean diet, intensive lifestyle | B |

### Weight Management Genetics

| Gene | Variant | Genotype | Obesity Risk | Intervention Response | Evidence |
|------|---------|----------|-------------|---------------------|----------|
| **FTO** | rs9939609 | TT | High (1.7x) | Lifestyle intervention more effective | B |
| **FTO** | rs9939609 | AT | Moderate (1.3x) | Standard weight management | B |
| **FTO** | rs9939609 | AA | Baseline | Standard prevention | B |
| **MC4R** | rs17782313 | CC | High | GLP-1 agonist response may differ | C |
| **MC4R** | rs17782313 | CT | Moderate | Standard | C |
| **MC4R** | rs17782313 | TT | Baseline | Standard | C |
| **PPARG** | rs1801282 | CC (Pro12Pro) | Baseline | Standard | C |
| **PPARG** | rs1801282 | CG (Pro12Ala) | Reduced risk | May have improved insulin sensitivity | C |

### Nutrigenomics Clinical Action Summary

| Pathway | Key Genes | Primary Intervention | Secondary Intervention | Monitor |
|---------|-----------|---------------------|----------------------|---------|
| Methylation | MTHFR, MTR, MTRR, COMT | L-methylfolate, B12, B6 | SAMe (cautious), betaine | Homocysteine, MMA |
| Vitamin D | VDR, GC | Vitamin D3 (dosed by genotype) | K2 cofactor | 25-OH Vitamin D |
| Omega-3 | FADS1/2, APOE | EPA/DHA (dosed by genotype) | Phosphatidylserine, krill oil | Omega-3 index |
| Cognitive Protection | APOE | DHA, Mediterranean diet, exercise | Curcumin, blueberries | Cognitive testing |
| Weight Management | FTO, MC4R, PPARG | Caloric restriction, exercise | Metformin (if appropriate) | BMI, waist circumference |

---

## 13. Safety Framework

### Safety Architecture

```
+============================================================================+
|                     SAFETY FRAMEWORK ARCHITECTURE                           |
+============================================================================+
|                                                                             |
|  LAYER 1: INPUT SAFETY                                                      |
|  +---------------------------------------------------------------------+   |
|  |  - Mandatory consent verification     - Clinician authorization       |   |
|  |  - Data validation & sanitization     - PHI protection                |   |
|  +---------------------------------------------------------------------+   |
|                              |                                              |
|  LAYER 2: PROCESSING SAFETY                                                 |
|  +---------------------------------------------------------------------+   |
|  |  - Evidence grade filtering (no D-grade shown without label)          |   |
|  |  - Population context application     - Uncertainty label attachment  |   |
|  |  - Safe wording template application  - Ancestry-aware analysis       |   |
|  +---------------------------------------------------------------------+   |
|                              |                                              |
|  LAYER 3: OUTPUT SAFETY                                                     |
|  +---------------------------------------------------------------------+   |
|  |  - "Decision-Support Only" banner     - Safe wording on all results   |   |
|  |  - Uncertainty labels                 - Evidence grade display        |   |
|  |  - Clinician review requirement flag  - Research-only badges          |   |
|  +---------------------------------------------------------------------+   |
|                              |                                              |
|  LAYER 4: PRESENTATION SAFETY                                               |
|  +---------------------------------------------------------------------+   |
|  |  - No prescribing language            - No definitive predictions     |   |
|  |  - No patient self-interpretation     - Clinician-facing by default   |   |
|  |  - Patient portal: summary only       - Full results: clinician only  |   |
|  +---------------------------------------------------------------------+   |
|                                                                             |
+============================================================================+
```

### Core Safety Principles

| # | Principle | Implementation | Verification |
|---|-----------|---------------|------------|
| 1 | **Decision-support only** | All outputs labeled; no prescribing language | Automated text analysis |
| 2 | **No definitive predictions** | Probability language only; no "will/won't" | Template enforcement |
| 3 | **Evidence-based only** | Every claim linked to evidence source | Database constraint |
| 4 | **Population context** | Ancestry-specific allele frequencies displayed | Automated check |
| 5 | **Uncertainty labels** | All findings labeled with confidence level | Template enforcement |
| 6 | **Research-grade separation** | D-grade evidence clearly marked "Research Only" | Badge system |
| 7 | **Clinician review gate** | Full results require clinician account | Auth check |
| 8 | **Patient summary only** | Patient portal shows simplified summaries | Role-based rendering |
| 9 | **Consent enforcement** | Genetic analysis blocked without valid consent | Pre-analysis check |
| 10 | **Audit trail** | All analyses logged immutably | Audit service |
| 11 | **HIPAA compliance** | PHI encrypted, access logged, BAAs in place | Security review |

### Evidence Grading System

| Grade | Label | Definition | Clinical Action | Display Rule |
|-------|-------|-----------|----------------|-------------|
| **A** | Strong | Meta-analyses, large RCTs, established CPIC guidelines | Actionable clinical recommendation | Full display, prominent |
| **B** | Moderate | Smaller RCTs, well-designed observational studies | Consider in clinical context | Full display |
| **C** | Optional | Limited studies, case reports, expert opinion | Informational only | Display with "Limited Evidence" label |
| **D** | Emerging | Preliminary research, in vitro studies, theoretical | Research context only | Display with "Research Only" badge |

### 11 Safe Wording Templates

| # | Template | Example Usage | Never Use |
|---|----------|--------------|-----------|
| 1 | **Metabolizer phenotype** | "Genetic testing indicates [CYP2D6 poor metabolizer] status" | "You are a poor metabolizer" |
| 2 | **Drug recommendation** | "May consider [alternative] based on [CYP2D6] metabolizer status" | "Switch to [drug]" |
| 3 | **Evidence strength** | "Evidence Grade [A]: Strong evidence supports this association" | "Proven" |
| 4 | **Population context** | "These frequencies are based on [European] populations; results may differ in other groups" | Ignore ancestry |
| 5 | **Uncertainty** | "This prediction has [moderate] confidence based on current evidence" | "Will respond" |
| 6 | **Research-only** | "Research-Only Finding: [Preliminary evidence suggests...]" | Present as fact |
| 7 | **Drug interaction** | "Increased monitoring may be warranted for [drug] with [CYP2D6 IM] status" | "Contraindicated" (unless CPIC) |
| 8 | **Pediatric** | "Pediatric considerations: [Metabolism may differ in children...]" | Adult dosing in children |
| 9 | **Geriatric** | "Geriatric considerations: [Additional monitoring recommended...]" | Ignore age factors |
| 10 | **Neuromodulation** | "Genetic factors may influence response to [rTMS]" | "rTMS will work" |
| 11 | **Nutrigenomics** | "Consider [L-methylfolate] supplementation based on [MTHFR] variant" | "You need folate" |

### Patient-Facing vs Clinician-Facing Content Rules

| Content Type | Clinician View | Patient View | Reason |
|-------------|---------------|-------------|--------|
| Full metabolizer report | Yes | Summary only | Complexity |
| Drug interaction matrix | Yes | No | Requires expertise |
| Severity classifications | Yes | Simplified labels | Risk of misinterpretation |
| Evidence grades | Yes | No | Technical |
| Population frequencies | Yes | Summary only | Complexity |
| Research-only findings | Yes (badged) | No | Preliminary |
| Nutrigenomics plan | Full details | Summary + actions | Actionable but simplified |
| Neuromodulation predictions | Full + parameters | Summary only | Requires expertise |
| Supplement recommendations | Dosing + rationale | General guidance | Safety |

### Consent Requirements

| Analysis Type | Consent Required | Consent Type | Documentation |
|--------------|-----------------|-------------|--------------|
| CYP450 metabolism | Yes | Pharmacogenomic testing | Signed, dated, witnessed |
| Psychiatric response | Yes | Pharmacogenomic testing + research | Signed, dated |
| Neuromodulation genetics | Yes | Pharmacogenomic testing + neuromodulation | Signed, dated |
| Nutrigenomics | Yes | Nutrigenomic testing | Signed, dated |
| Full panel | Yes | Comprehensive pharmacogenomic | Signed, dated, witnessed |
| VCF upload | Yes | Data upload + storage + analysis | Digital signature |
| Pediatric (<18) | Yes | Parent/guardian + assent | Both signatures |

### Audit Trail Requirements

| Event | Logged | Immutable | Retention |
|-------|--------|-----------|-----------|
| Analysis requested | Yes | Yes | 7 years |
| Consent verified | Yes | Yes | 7 years |
| Results generated | Yes | Yes | 7 years |
| Report viewed | Yes | Yes | 7 years |
| Report exported | Yes | Yes | 7 years |
| Report printed | Yes | Yes | 7 years |
| Clinician review | Yes | Yes | 7 years |
| Settings changed | Yes | Yes | 7 years |

---

## 14. Cross-Page Integration

### Integration Matrix

| This Module | Links To | Data Flow | Integration Type |
|-------------|----------|-----------|-----------------|
| **Genetic Medication Analyzer** | **Protocol Hub** | Genetic predictions feed into protocol parameter suggestions | Bidirectional API |
| **Genetic Medication Analyzer** | **qEEG Analyzer** | BDNF/COMT status informs EEG biomarker interpretation | Unidirectional (GMA -> qEEG) |
| **Genetic Medication Analyzer** | **Biomarker Console** | MTHFR/folate status correlates with blood biomarker panels | Bidirectional correlation |
| **Genetic Medication Analyzer** | **DeepTwin** | Genetic profile informs simulation parameters | Unidirectional (GMA -> DeepTwin) |
| **Genetic Medication Analyzer** | **MRI Analyzer** | CACNA1C/ANK3 status informs structural analysis | Unidirectional (GMA -> MRI) |
| **Genetic Medication Analyzer** | **Patient CRM** | Genetic profiles stored in patient records | Bidirectional sync |
| **Genetic Medication Analyzer** | **Evidence Research** | All gene-drug pairs link to evidence database | Unidirectional lookup |
| **Protocol Hub** | **Genetic Medication Analyzer** | Protocols query GMA for patient-specific parameter adjustments | API call |
| **qEEG Analyzer** | **Genetic Medication Analyzer** | qEEG requests neuromodulation genetics for protocol personalization | API call |

### Data Flow Diagrams

#### GMA -> Protocol Hub Integration

```
+----------------------------+        +----------------------------+
|  Genetic Medication        |        |  Protocol Hub              |
|  Analyzer                  |        |                            |
|                            |        |                            |
|  BDNF Val66Met = Met/Met   |------->|  rTMS Protocol Adjustment  |
|  -> Reduce response 30%    |  API   |  -> Increase sessions to   |
|                            |        |    30-36 (from 20-30)      |
|  CYP2D6 = PM               |------->|  Medication Selection      |
|  -> Avoid codeine,         |  API   |  -> Exclude codeine-based  |
|     tamoxifen              |        |    protocols               |
|                            |        |                            |
|  MTHFR 677TT               |------->|  Nutritional Protocol      |
|  -> Recommend L-methyl-    |  API   |  -> Add methylfolate to    |
|     folate 1000mcg         |        |    adjunct recommendations |
|                            |        |                            |
+----------------------------+        +----------------------------+
```

#### GMA -> Biomarker Console Integration

```
+----------------------------+        +----------------------------+
|  Genetic Medication        |        |  Biomarker Console         |
|  Analyzer                  |        |                            |
|                            |        |                            |
|  MTHFR C677T = T/T         |------->|  Flag: High homocysteine   |
|  -> 60-70% reduced activity|  Corr  |     risk                   |
|                            |        |  -> Order homocysteine     |
|                            |        |     panel automatically    |
|  APOE e4/e4                |------->|  Flag: Elevated LDL risk   |
|  -> High cognitive risk    |  Corr  |  -> Recommend lipid panel  |
|                            |        |                            |
|  VDR FokI = ff             |------->|  Flag: Vitamin D insuffic. |
|  -> Reduced receptor       |  Corr  |  -> Order 25-OH Vitamin D  |
|                            |        |                            |
+----------------------------+        +----------------------------+
```

#### GMA -> DeepTwin Integration

```
+----------------------------+        +----------------------------+
|  Genetic Medication        |        |  DeepTwin Simulator        |
|  Analyzer                  |        |                            |
|                            |        |                            |
|  COMT Val158Met = Met/Met  |------->|  Adjust dopamine model     |
|  -> Slow dopamine clearance|  API   |  -> Slow COMT degradation  |
|                            |        |    in simulation           |
|  BDNF Val66Met = Val/Met   |------->|  Adjust plasticity model   |
|  -> Normal plasticity      |  API   |  -> Standard LTD/LTP       |
|                            |        |    parameters              |
|  CACNA1C rs1006737 = A/A   |------->|  Adjust calcium channel    |
|  -> Enhanced calcium       |  API   |  -> Increase Cav1.2        |
|     signaling              |        |    conductance             |
|                            |        |                            |
+----------------------------+        +----------------------------+
```

### Integration API Contracts

#### Protocol Hub -> GMA API Call

```typescript
// Protocol Hub requests genetic-informed protocol adjustments
const response = await fetch('/api/v1/gma/analyze', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    patient_id: patientId,
    genetic_data: { /* patient genetic profile */ },
    target_conditions: [condition],
    analysis_modules: ['neuromodulation', 'metabolism'],
    consent_confirmed: true
  })
});

// Response feeds into Protocol Hub parameter engine
const geneticAdjustments = {
  bdnf_adjustment: response.neuromodulation_results.bdnf_parameter_modifier,
  session_count_adjustment: response.neuromodulation_results.suggested_sessions,
  medication_exclusions: response.drug_interactions
    .filter(d => d.severity === 'major')
    .map(d => d.drug_name)
};
```

#### Biomarker Console -> GMA Correlation

```typescript
// Biomarker Console queries GMA for genetic context
const geneticContext = await fetch(`/api/v1/gma/profile/${patientId}`);

// Correlate with biomarker results
const correlations = [
  {
    gene: 'MTHFR',
    variant: 'C677T',
    genotype: 'T/T',
    biomarker: 'homocysteine',
    expected: 'elevated',
    action: 'Order homocysteine panel'
  },
  {
    gene: 'VDR',
    variant: 'FokI',
    genotype: 'ff',
    biomarker: '25_oh_vitamin_d',
    expected: 'insufficient',
    action: 'Order vitamin D panel'
  }
];
```

---

## 15. Technology Stack

### Full Technology Stack Table

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend Framework** | Next.js | 14+ | React framework with SSR/SSG |
| **Frontend Language** | TypeScript | 5.3+ | Type safety |
| **Styling** | Tailwind CSS | 3.4+ | Utility-first CSS |
| **UI Components** | shadcn/ui | latest | Accessible component library |
| **State Management** | Zustand | 4.5+ | Lightweight state management |
| **Data Fetching** | TanStack Query | 5+ | Server state management |
| **Charts** | Recharts | 2.12+ | Data visualization |
| **Backend Framework** | FastAPI | 0.110+ | Python async API framework |
| **Backend Language** | Python | 3.11+ | Core language |
| **Validation** | Pydantic | 2.6+ | Data validation |
| **Database** | PostgreSQL | 16+ | Primary database |
| **Cache** | Redis | 7+ | Caching and sessions |
| **Queue** | Celery + Redis | 5.3+ | Background tasks |
| **Search** | PostgreSQL FTS | 16+ | Full-text search |
| **PDF Generation** | WeasyPrint | 62+ | Report PDF generation |
| **Templating** | Jinja2 | 3.1+ | Report templates |
| **Testing (Backend)** | pytest | 8+ | Python testing |
| **Testing (Frontend)** | Vitest | 1.3+ | Frontend testing |
| **E2E Testing** | Playwright | 1.42+ | End-to-end testing |
| **Containerization** | Docker | 25+ | Container runtime |
| **Orchestration** | Docker Compose | 2.24+ | Multi-container management |
| **API Documentation** | FastAPI OpenAPI | auto | Interactive API docs |
| **Auth** | OAuth2 + JWT | | Authentication |
| **Encryption** | AES-256-GCM | | PHI encryption |
| **Audit Logging** | PostgreSQL + S3 | | Immutable audit trail |
| **Monitoring** | Prometheus + Grafana | | Metrics and dashboards |
| **Version Control** | Git + GitHub | | Source control |
| **CI/CD** | GitHub Actions | | Automated testing and deployment |
| **Cloud Platform** | AWS / Fly.io | | Hosting |
| **FHIR Support** | fhir.resources | | EHR integration |
| **VCF Parsing** | pysam / cyvcf2 | | Genetic file parsing |

---

## 16. Implementation Roadmap

### 12-Week Implementation Plan

| Week | Deliverables | Module | Lines Target | Tests |
|------|-------------|--------|-------------|-------|
| **Week 1** | Project scaffold, database schema, API foundation | Backend core | 1,200 | 15 |
| **Week 2** | CYP450 metabolism engine, metabolizer calculator | Metabolism | 1,500 | 20 |
| **Week 3** | Psychiatric response prediction engine | Psychiatric | 1,200 | 15 |
| **Week 4** | Neuromodulation genetics engine | Neuromodulation | 900 | 10 |
| **Week 5** | Nutrigenomics analysis engine | Nutrigenomics | 1,000 | 12 |
| **Week 6** | Drug interaction matrix, evidence integration | Core engine | 1,300 | 18 |
| **Week 7** | Report generator (PDF/HTML), export system | Reporting | 1,100 | 12 |
| **Week 8** | Dashboard frontend, Gene browser | Frontend M1-M2 | 800 | 10 |
| **Week 9** | Drug interaction UI, Metabolizer UI | Frontend M3-M4 | 900 | 10 |
| **Week 10** | Psychiatric UI, Neuromodulation UI | Frontend M5-M6 | 700 | 8 |
| **Week 11** | Nutrigenomics UI, Settings & Consent | Frontend M7-M8 | 600 | 8 |
| **Week 12** | Integration testing, E2E testing, documentation | QA & Docs | -- | 15 |

### Week 1: Foundation (Backend Core)

**Deliverables:**
- [ ] Database schema for all 10 Pydantic models
- [ ] FastAPI router with all 16 endpoints (stubs)
- [ ] Authentication middleware (OAuth2 + JWT)
- [ ] Consent verification middleware
- [ ] Audit logging service
- [ ] VCF upload and parsing service
- [ ] Health check endpoint
- [ ] API documentation (OpenAPI)

**Key Files:**
```
backend/app/gma/
  router.py                 # 16 API endpoints
  models.py                 # 10 Pydantic models
  schemas.py                # Database schemas
  services/
    analysis_engine.py      # Core analysis orchestrator
    consent_service.py      # Consent verification
    audit_service.py        # Audit logging
    vcf_parser.py           # VCF file parsing
  tests/
    test_router.py          # API endpoint tests
    test_models.py          # Model validation tests
    test_services.py        # Service unit tests
```

### Week 2: CYP450 Metabolism Engine

**Deliverables:**
- [ ] CYP2D6 metabolizer calculator (activity score -> phenotype)
- [ ] CYP2C19 metabolizer calculator
- [ ] CYP2B6 metabolizer calculator
- [ ] CYP3A4/5 metabolizer calculator
- [ ] CYP1A2 phenotype calculator
- [ ] Drug interaction checker per metabolizer phenotype
- [ ] CPIC guideline integration
- [ ] FDA label integration
- [ ] Population frequency database

**Key Files:**
```
backend/app/gma/services/
  metabolism/
    cyp2d6.py               # CYP2D6 calculator
    cyp2c19.py              # CYP2C19 calculator
    cyp2b6.py               # CYP2B6 calculator
    cyp3a4_5.py             # CYP3A4/5 calculator
    cyp1a2.py               # CYP1A2 calculator
    drug_interactions.py    # Drug interaction matrix
    cpic_guidelines.py      # CPIC guideline lookups
    fda_labels.py           # FDA label lookups
    population_frequencies.py # Population data
```

### Week 3: Psychiatric Response Prediction

**Deliverables:**
- [ ] SLC6A4 response prediction (5-HTTLPR)
- [ ] HTR2A response prediction
- [ ] HTR2C response prediction (weight gain risk)
- [ ] COMT response prediction (cognitive/stress)
- [ ] DRD2 response prediction (antipsychotic)
- [ ] ADRA2A response prediction (ADHD)
- [ ] Evidence source linking
- [ ] Safe wording application
- [ ] Uncertainty labeling

### Week 4: Neuromodulation Genetics

**Deliverables:**
- [ ] BDNF Val66Met response prediction (rTMS)
- [ ] GRIK4 response prediction (rTMS)
- [ ] CACNA1C response prediction (tDCS)
- [ ] ANK3 response prediction (TMS in BD)
- [ ] SCN1A contraindication checker
- [ ] Parameter suggestion engine
- [ ] Protocol Hub integration endpoint

### Week 5: Nutrigenomics Analysis

**Deliverables:**
- [ ] MTHFR C677T/A1298C analysis
- [ ] Methylation capacity calculator
- [ ] Homocysteine risk stratification
- [ ] VDR variant analysis
- [ ] Omega-3 genetics (FADS1/2)
- [ ] APOE cognitive risk analysis
- [ ] Supplement recommendation engine
- [ ] Weight management genetics

### Week 6: Integration Layer

**Deliverables:**
- [ ] Full drug-gene interaction matrix (200+ pairs)
- [ ] Evidence integration across all sources
- [ ] Ancestry-aware analysis
- [ ] Pediatric analysis module
- [ ] Geriatric analysis module
- [ ] Complete analysis orchestrator
- [ ] Safe wording template engine

### Week 7: Report Generation

**Deliverables:**
- [ ] PDF report template (comprehensive)
- [ ] PDF report template (summary)
- [ ] HTML report template
- [ ] Patient-facing report (simplified)
- [ ] Clinician-facing report (full detail)
- [ ] Export service (async generation)
- [ ] Print-friendly CSS

### Week 8: Frontend - Dashboard & Gene Browser

**Deliverables:**
- [ ] Dashboard page (overview cards)
- [ ] Profile summary component
- [ ] Risk summary panel
- [ ] Metabolizer overview badges
- [ ] Gene browser page
- [ ] Gene search with autocomplete
- [ ] Gene detail cards
- [ ] Population frequency charts

### Week 9: Frontend - Drug Interaction & Metabolizer

**Deliverables:**
- [ ] Drug interaction matrix page
- [ ] Interactive severity grid
- [ ] Filter controls (severity, gene, drug class)
- [ ] Interaction detail cards
- [ ] Metabolizer calculator page
- [ ] Activity score gauge
- [ ] Phenotype cards
- [ ] Drug impact tables

### Week 10: Frontend - Psychiatric & Neuromodulation

**Deliverables:**
- [ ] Psychiatric response page
- [ ] Condition selector
- [ ] Medication class tabs
- [ ] Response prediction cards
- [ ] Neuromodulation page
- [ ] Modality selector
- [ ] Parameter suggestion display
- [ ] Contraindication alerts

### Week 11: Frontend - Nutrigenomics & Settings

**Deliverables:**
- [ ] Nutrigenomics page
- [ ] MTHFR panel
- [ ] Methylation visualizer
- [ ] Supplement cards
- [ ] Settings page
- [ ] Consent manager
- [ ] Ancestry selector
- [ ] Export preferences

### Week 12: Testing & Documentation

**Deliverables:**
- [ ] E2E test suite (Playwright)
- [ ] Integration test suite
- [ ] Load testing (k6)
- [ ] Security audit
- [ ] Clinical safety review
- [ ] User documentation
- [ ] API documentation finalization
- [ ] Deployment pipeline

---

## 17. Future Enhancements

### Near-Term (6-12 months)

| Feature | Description | Complexity | Priority |
|---------|-------------|-----------|----------|
| **VCF Auto-Ingestion** | Automated parsing of major genetic testing provider formats (23andMe, AncestryDNA, Color Genomics, Invitae) | Medium | High |
| **FHIR Genomics Integration** | Full FHIR R4 Genomics profile support for EHR data exchange | Medium | High |
| **Polygenic Risk Scores** | Calculate PRS for medication response across multiple variants | High | Medium |
| **Real-Time Evidence Updates** | Automated daily sync with PharmGKB and CPIC for updated guidelines | Medium | High |

### Mid-Term (1-2 years)

| Feature | Description | Complexity | Priority |
|---------|-------------|-----------|----------|
| **Multi-Ancestry Panels** | Expanded allele frequency data for African, Asian, Latin American, and Indigenous populations | High | High |
| **Pediatric-Specific Analysis** | Developmental metabolism curves, age-adjusted phenotypes | High | Medium |
| **Geriatric Polypharmacy Engine** | Beers Criteria integration, age-related metabolic decline modeling | High | Medium |
| **Drug-Drug-Gene Interactions** | Three-way interaction analysis (drug A + drug B + gene variant) | High | Medium |
| **WGS Support** | Whole genome sequencing data ingestion and analysis | High | Low |
| **Machine Learning Models** | ML-based response prediction integrating genetic + clinical + biomarker data | Very High | Medium |

### Long-Term (2-3 years)

| Feature | Description | Complexity | Priority |
|---------|-------------|-----------|----------|
| **Real-World Evidence Integration** | Integration with de-identified outcome databases for continuous model improvement | Very High | Medium |
| **Clinical Trial Matching** | Match patients to relevant pharmacogenomics clinical trials | Medium | Low |
| **International Guideline Expansion** | DPWG (Dutch), CPIC (Canadian), EMA pharmacogenomic guidelines | Medium | Medium |
| **Pharmacoeconomic Analysis** | Cost-effectiveness modeling for genetic testing vs standard care | High | Low |
| **Longitudinal Outcome Tracking** | Track medication outcomes over time to validate predictions | High | Medium |

### Research Pipeline

| Research Area | Status | Target Publication |
|--------------|--------|-------------------|
| Multi-gene rTMS response prediction model | Data collection | 2027 |
| MTHFR + antidepressant augmentation outcomes | Analysis phase | 2026 Q4 |
| CYP2D6 pediatric dosing validation | Protocol development | 2027 |
| Nutrigenomics + neuromodulation synergy | Hypothesis phase | 2027 |
| Ancestry-specific allele frequency database | Data collection | 2026 Q4 |

---

## 18. Appendices

### Appendix A: Safe Wording Templates (Complete)

#### Template 1: Metabolizer Phenotype Communication

**Clinician-facing:**
> "Genetic analysis indicates [CYP2D6] [poor metabolizer] phenotype (Activity Score: 0.0) based on the [*4/*4] diplotype. Per CPIC guidelines, this phenotype is associated with [significantly reduced] metabolism of [CYP2D6 substrate medications]. Clinical implications should be considered when prescribing relevant medications."

**Patient-facing:**
> "Your genetic test results show how your body processes certain medications. This information helps your doctor choose the right medication and dose for you. Your doctor will explain what this means for your treatment."

**NEVER use:**
- "You are a poor metabolizer"
- "Your genes are defective"
- "You cannot take [drug]"
- "You must switch to [drug]"

#### Template 2: Drug Recommendation Communication

**Clinician-facing:**
> "Based on [CYP2D6 poor metabolizer] status, the available evidence [Grade A] suggests that [codeine] may have [reduced or absent analgesic effect] due to [lack of morphine production]. Alternative analgesics [not primarily metabolized by CYP2D6] may be considered."

**Patient-facing:**
> "Your genetic results suggest that some pain medications may not work as well for you. Your doctor may consider other options."

#### Template 3: Evidence Strength Communication

| Grade | Wording |
|-------|---------|
| A | "Strong evidence (Grade A) supports this recommendation based on [multiple large studies / CPIC guidelines / FDA label]." |
| B | "Moderate evidence (Grade B) suggests this association based on [smaller studies / observational data]." |
| C | "Limited evidence (Grade C) exists for this association; findings should be considered [informational / preliminary]." |
| D | "Emerging evidence (Grade D) -- this is a [research-only finding / theoretical association] not yet validated for clinical use." |

#### Template 4: Population Context Communication

> "Allele frequencies used in this analysis are based on [European ancestry] reference populations. Genetic variation patterns differ across populations. If your ancestry differs from the reference population, the clinical implications may vary. Ancestry-specific testing and interpretation are recommended when available."

#### Template 5: Uncertainty Communication

> "This prediction is based on [moderate] confidence evidence. Individual medication response is influenced by many factors including [genetics, age, diet, other medications, and overall health]. This genetic information is [one of many tools] your healthcare provider may use to guide treatment decisions."

#### Template 6: Research-Only Finding

> "**RESEARCH-ONLY FINDING** -- This association is based on [preliminary / limited / emerging] evidence and is [not yet validated] for routine clinical use. It is provided for [informational / research] purposes only and should [not be used to guide treatment decisions] without additional clinical validation."

#### Template 7: Drug Interaction Communication

**Major:**
> "**Major Interaction** -- Evidence [Grade A] indicates that [drug] combined with [CYP2D6 poor metabolizer] status may result in [significantly altered drug levels]. Consideration of [alternative therapy] is recommended per [CPIC guidelines]."

**Moderate:**
> "**Moderate Interaction** -- [CYP2D6 intermediate metabolizer] status may result in [increased drug levels] of [drug]. [Enhanced monitoring] or [alternative therapy] may be considered."

**Minor:**
> "**Minor Interaction** -- [CYP2D6] status may have [minimal clinical significance] for [drug]. Standard monitoring is appropriate."

#### Template 8: Pediatric Consideration

> "**Pediatric Consideration** -- CYP450 enzyme activity [develops gradually] during childhood. [CYP2D6] reaches adult-equivalent activity by approximately [age 6-10 years]. Current analysis assumes [adult-equivalent] metabolism. Pediatric-specific interpretation and dosing [require specialist consultation]."

#### Template 9: Geriatric Consideration

> "**Geriatric Consideration** -- Age-related [decline in hepatic blood flow and CYP450 activity] may [compound] genetic metabolic differences. [Polypharmacy] increases the risk of [drug-drug-gene interactions]. Enhanced monitoring and [lower starting doses] may be warranted independent of genetic status."

#### Template 10: Neuromodulation Response Communication

> "Genetic factors [may influence] response to [repetitive transcranial magnetic stimulation]. The [BDNF Val66Met] variant is [associated with] [reduced response likelihood] based on [meta-analytic evidence]. This is [one of multiple factors] affecting treatment response and should be considered [alongside clinical characteristics]."

#### Template 11: Nutrigenomics Communication

> "The [MTHFR C677T] variant is [associated with] [reduced enzyme activity]. Consideration of [L-methylfolate] supplementation [may be discussed with] your healthcare provider. This genetic information [does not replace] standard nutritional assessment and laboratory testing."

### Appendix B: Evidence Grade Definitions

| Grade | Name | Definition | Study Requirements | Clinical Validity |
|-------|------|-----------|-------------------|-------------------|
| **A** | Strong | High-confidence, actionable recommendation | Meta-analysis or multiple large RCTs (n>500); replicated findings; established biological mechanism; CPIC guideline published | Ready for clinical implementation |
| **B** | Moderate | Actionable with clinical context | At least one well-designed RCT or multiple observational studies (n>200); replicated at least once; plausible mechanism | Suitable for clinical consideration |
| **C** | Optional | Informational; limited evidence | Small studies (n<200), case-control, or retrospective; may not be replicated; mechanism hypothesized | Informational only; not primary basis for decisions |
| **D** | Emerging | Research-only; not clinically validated | Preliminary studies, in vitro data, animal models, theoretical; no replication | Not suitable for clinical use |

### Grade Modifiers

| Modifier | Meaning | Example |
|----------|---------|---------|
| + | Strong within grade | A+ (near-unanimous meta-analytic evidence) |
| - | Weak within grade | B- (single study, borderline significance) |
| r | Replication pending | Br (single study awaiting replication) |
| p | Population-specific | Ap (evidence strong in specific population) |

### Appendix C: Gene-Drug Quick Reference

#### CYP2D6 Quick Reference

| Drug Class | Example Drugs | UM | EM | IM | PM | Evidence |
|-----------|-------------|----|----|----|----|----------|
| Opioid prodrugs | Codeine, tramadol | Toxicity risk | Normal | Reduced effect | No effect | A |
| SSRIs | Fluoxetine, paroxetine | Normal | Normal | Increased levels | Increased levels | B |
| TCAs | Nortriptyline, amitriptyline | Subtherapeutic | Normal | 50% dose | 50% dose | A |
| Antipsychotics | Risperidone, haloperidol | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Beta-blockers | Metoprolol, timolol | Subtherapeutic | Normal | Increased levels | Increased levels | B |
| Antiemetics | Ondansetron | Reduced effect | Normal | Increased levels | Increased levels | B |
| ADHD meds | Atomoxetine | Subtherapeutic | Normal | Lower dose | Lower dose | A |

#### CYP2C19 Quick Reference

| Drug Class | Example Drugs | UM/RM | EM | IM | PM | Evidence |
|-----------|-------------|-------|----|----|----|----------|
| Antiplatelet | Clopidogrel | Normal | Normal | Reduced effect | No effect | A |
| Antifungal | Voriconazole | Subtherapeutic | Normal | Increased | Avoid | A |
| SSRIs | Citalopram, escitalopram | Normal | Normal | 50% max | 50% max | A |
| Benzodiazepines | Diazepam | Normal | Normal | Increased | Increased | B |
| TCAs | Amitriptyline | Normal | Normal | 50% dose | 50% dose | B |
| PPIs | Omeprazole | Reduced effect | Normal | Enhanced | Enhanced | B |

#### HLA-B Quick Reference

| Allele | Drug | Reaction | Risk if Positive | Action | Evidence |
|--------|------|----------|-----------------|--------|----------|
| *15:02 | Carbamazepine | SJS/TEN | 3-10% | Avoid | A |
| *15:02 | Oxcarbazepine | SJS/TEN | 3-10% | Avoid | A |
| *15:02 | Phenytoin | SJS/TEN | 2-5% | Avoid | A |
| *57:01 | Abacavir | Hypersensitivity | 50-70% | Contraindicated | A |
| *58:01 | Allopurinol | SJS/TEN | 2-5% | Consider alternative | A |

### Appendix D: Color Coding Reference

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Major interaction | Red | #DC2626 | Action required |
| Moderate interaction | Orange | #F97316 | Consider alternative |
| Minor interaction | Yellow | #EAB308 | Monitor |
| Beneficial interaction | Green | #22C55E | Advantageous |
| Informational | Blue | #3B82F6 | Reference only |
| Ultra-Rapid metabolizer | Purple | #9333EA | Caution -- high activity |
| Normal/Extensive metabolizer | Green | #22C55E | Standard |
| Intermediate metabolizer | Yellow | #EAB308 | Reduced activity |
| Poor metabolizer | Red | #DC2626 | Significantly reduced |
| Grade A evidence | Dark green | #15803D | Strong |
| Grade B evidence | Blue | #2563EB | Moderate |
| Grade C evidence | Yellow | #CA8A04 | Optional |
| Grade D evidence | Gray | #6B7280 | Emerging |
| Research-only badge | Gray bg, dark text | #F3F4F6 / #374151 | Research context |
| Safety banner | Amber bg, dark text | #FEF3C7 / #92400E | Persistent warning |

### Appendix E: Button/Action Matrix

| Button | Context | Action | Confirmation | Logged |
|--------|---------|--------|-------------|--------|
| "Analyze" | Dashboard | Run comprehensive analysis | Yes (consent check) | Yes |
| "Generate Report" | Any results page | Create PDF/HTML report | No | Yes |
| "Export" | Any results page | Export to CSV/JSON | No | Yes |
| "Print" | Report view | Print-friendly version | No | Yes |
| "Share with Clinician" | Patient portal | Send to linked clinician | Yes | Yes |
| "Delete Profile" | Settings | Remove genetic data | Yes (type "DELETE") | Yes |
| "Update Consent" | Settings | Modify consent preferences | Yes | Yes |
| "View Evidence" | Any gene card | Show evidence sources | No | No |
| "CPIC Guideline" | Metabolizer result | Link to CPIC guideline | No | No |
| "FDA Label" | Drug interaction | Link to FDA label | No | No |

### Appendix F: Glossary

| Term | Definition |
|------|-----------|
| **Activity Score** | Numerical representation of CYP450 enzyme activity used to classify metabolizer phenotypes (CPIC standard) |
| **Allele** | One of two or more versions of a gene at a specific location on a chromosome |
| **Diplotype** | The combination of two alleles (one from each parent) for a specific gene |
| **Evidence Grade** | Classification of scientific evidence quality (A=Strong, B=Moderate, C=Optional, D=Emerging) |
| **Extensive Metabolizer (EM)** | Individual with normal CYP450 enzyme activity |
| **FDA Pharmacogenomic Label** | FDA-required genetic information on drug labeling |
| **Gene-Drug Interaction** | Situation where genetic variation affects drug metabolism, efficacy, or safety |
| **Intermediate Metabolizer (IM)** | Individual with reduced CYP450 enzyme activity |
| **Metabolizer Phenotype** | Classification of drug metabolism rate based on genetic testing |
| **Pharmacogenomics (PGx)** | Study of how genetic variation affects individual response to medications |
| **Pharmacokinetics** | How the body processes a drug (absorption, distribution, metabolism, excretion) |
| **Pharmacodynamics** | How a drug affects the body (mechanism of action, receptor binding) |
| **Poor Metabolizer (PM)** | Individual with little to no CYP450 enzyme activity |
| **Polypharmacy** | Use of multiple medications simultaneously |
| **Prodrug** | Medication that requires metabolic activation to become therapeutically active |
| **Single Nucleotide Polymorphism (SNP)** | Single DNA base-pair variation |
| **Star Allele** | Standardized nomenclature for pharmacogene variants (*1=normal, *2-*n=variant) |
| **Substrate** | Drug that is metabolized by a specific enzyme |
| **Ultra-Rapid Metabolizer (UM)** | Individual with exceptionally high CYP450 enzyme activity |
| **VCF (Variant Call Format)** | Standard file format for storing gene sequence variations |

### Appendix G: CPIC Guideline Integration

| CPIC Guideline | Gene | Drugs | Status | URL |
|---------------|------|-------|--------|-----|
| CYP2D6 -- Codeine | CYP2D6 | Codeine, tramadol | Published | cpicpgx.org/guidelines |
| CYP2D6 -- Tamoxifen | CYP2D6 | Tamoxifen | Published | cpicpgx.org/guidelines |
| CYP2D6 -- Atomoxetine/TCAs | CYP2D6 | Atomoxetine, nortriptyline, amitriptyline | Published | cpicpgx.org/guidelines |
| CYP2C19 -- Clopidogrel | CYP2C19 | Clopidogrel | Published | cpicpgx.org/guidelines |
| CYP2C19 -- Voriconazole | CYP2C19 | Voriconazole | Published | cpicpgx.org/guidelines |
| CYP2C19 -- SSRIs/TCAs | CYP2C19 | Citalopram, escitalopram, amitriptyline | Published | cpicpgx.org/guidelines |
| CYP2C19 -- PPIs | CYP2C19 | Omeprazole, lansoprazole | Published | cpicpgx.org/guidelines |
| CYP2B6 -- Efavirenz | CYP2B6 | Efavirenz | Published | cpicpgx.org/guidelines |
| CYP3A5 -- Tacrolimus | CYP3A5 | Tacrolimus | Published | cpicpgx.org/guidelines |
| HLA-B -- Carbamazepine | HLA-B | Carbamazepine, oxcarbazepine | Published | cpicpgx.org/guidelines |
| HLA-B -- Abacavir | HLA-B | Abacavir | Published | cpicpgx.org/guidelines |
| HLA-B -- Allopurinol | HLA-B | Allopurinol | Published | cpicpgx.org/guidelines |
| DPYD -- Fluoropyrimidines | DPYD | 5-FU, capecitabine | Published | cpicpgx.org/guidelines |
| TPMT/NUDT15 -- Thiopurines | TPMT, NUDT15 | Azathioprine, 6-MP | Published | cpicpgx.org/guidelines |
| CYP3A4 -- Tacrolimus | CYP3A4 | Tacrolimus | In Development | -- |
| CYP1A2 -- Clozapine | CYP1A2 | Clozapine, olanzapine | In Development | -- |

### Appendix H: FDA Pharmacogenomic Biomarker Table Integration

| Gene | Biomarker | Drug(s) | Label Section | Type |
|------|-----------|---------|--------------|------|
| CYP2D6 | Poor metabolizer | Codeine | Boxed Warning, Contraindication | Safety |
| CYP2D6 | Ultra-rapid metabolizer | Codeine | Boxed Warning, Contraindication | Safety |
| CYP2D6 | Poor metabolizer | Tramadol | Warnings and Precautions | Safety |
| CYP2D6 | Ultra-rapid metabolizer | Tramadol | Warnings and Precautions | Safety |
| CYP2D6 | Poor metabolizer | Atomoxetine | Dosage and Administration | Dosing |
| CYP2D6 | Poor metabolizer | Tamoxifen | Clinical Pharmacology | Efficacy |
| CYP2C19 | Poor metabolizer | Clopidogrel | Boxed Warning | Efficacy |
| CYP2C19 | Poor metabolizer | Voriconazole | Dosage and Administration | Dosing |
| CYP2C19 | Poor metabolizer | Citalopram | Dosage and Administration | Safety (QT) |
| CYP2C19 | Poor metabolizer | Escitalopram | Dosage and Administration | Safety (QT) |
| CYP3A5 | Non-expresser | Tacrolimus | Dosage and Administration | Dosing |
| HLA-B | *15:02 | Carbamazepine | Boxed Warning | Safety (SJS/TEN) |
| HLA-B | *57:01 | Abacavir | Contraindication | Safety (HSR) |
| HLA-B | *58:01 | Allopurinol | Warnings and Precautions | Safety (SJS/TEN) |
| DPYD | *2A, *13 | Fluorouracil | Contraindication/Warnings | Safety |
| TPMT | *2, *3A | Azathioprine, 6-MP | Dosage and Administration | Safety |

### Appendix I: Population-Specific Considerations

#### African Populations

| Consideration | Details |
|--------------|---------|
| CYP2D6 | Higher frequency of *17 and *29 (reduced function); gene duplication (*1xn, *2xn) more common |
| CYP2C19 | *17 (increased function) more common; UM phenotype 15-25% |
| HLA-B | *15:02 rare; *57:01 less common than European |
| Testing recommendations | Include reduced-function alleles common in African populations |

#### East Asian Populations

| Consideration | Details |
|--------------|---------|
| CYP2D6 | *10 (reduced function) very common (~50%); PM very rare |
| CYP2C19 | PM frequency 13-15% (highest globally); *2 and *3 alleles |
| HLA-B | *15:02 common (5-10%); *58:01 very common for allopurinol risk |
| NUDT15 | *2, *3 common -- thiopurine toxicity risk |
| Testing recommendations | Include *10 for CYP2D6; *2/*3 for CYP2C19; *15:02 for HLA-B |

#### South Asian Populations

| Consideration | Details |
|--------------|---------|
| CYP2D6 | *10 common; PM 1-2% |
| CYP2C19 | PM 5-8%; *2 and *3 alleles |
| HLA-B | *15:02 rare; *57:01 less common |
| Testing recommendations | Include population-common alleles |

#### European Populations

| Consideration | Details |
|--------------|---------|
| CYP2D6 | *3, *4, *6 (non-functional) common; PM 6-8% |
| CYP2C19 | *2 (non-functional) common; *17 (increased) 15-20% |
| HLA-B | *57:01 common (5-8%); *15:02 rare |
| TPMT | *2, *3A common -- standard thiopurine testing |
| Testing recommendations | Standard commercial panels well-suited |

#### Latin American Populations

| Consideration | Details |
|--------------|---------|
| Mixed ancestry | European + Indigenous + African admixture |
| CYP2D6 | Highly variable; reduced-function alleles common |
| HLA-B | *15:02 risk in some Indigenous populations |
| Testing recommendations | Comprehensive allele panel recommended |

### Appendix J: File Structure

```
/mnt/agents/DeepSynaps-Protocol-Studio/
├── WORLD_CLASS_DEEPSYNAPS_GENETIC_MEDICATION_ANALYZER_ROADMAP.md  (This file)
├── backend/
│   └── app/
│       └── gma/
│           ├── __init__.py
│           ├── router.py                    # 16 API endpoints
│           ├── models.py                    # 10 Pydantic models
│           ├── schemas.py                   # Database schemas
│           ├── config.py                    # Module configuration
│           ├── constants.py                 # Constants, safe wording
│           ├── services/
│           │   ├── __init__.py
│           │   ├── analysis_engine.py       # Core orchestrator
│           │   ├── consent_service.py       # Consent verification
│           │   ├── audit_service.py         # Audit logging
│           │   ├── report_generator.py      # PDF/HTML generation
│           │   ├── safe_wording.py          # Safe wording templates
│           │   ├── vcf_parser.py            # VCF file parsing
│           │   ├── fhir_adapter.py          # FHIR integration
│           │   └── metabolism/
│           │       ├── __init__.py
│           │       ├── cyp2d6.py
│           │       ├── cyp2c19.py
│           │       ├── cyp2b6.py
│           │       ├── cyp3a4_5.py
│           │       ├── cyp1a2.py
│           │       ├── drug_interactions.py
│           │       ├── cpic_guidelines.py
│           │       ├── fda_labels.py
│           │       └── population_frequencies.py
│           │   ├── psychiatric/
│           │       ├── __init__.py
│           │       ├── slc6a4.py
│           │       ├── htr2a.py
│           │       ├── htr2c.py
│           │       ├── comt.py
│           │       ├── drd2.py
│           │       ├── adra2a.py
│           │       └── evidence_sources.py
│           │   ├── neuromodulation/
│           │       ├── __init__.py
│           │       ├── bdnf.py
│           │       ├── grik4.py
│           │       ├── cacna1c.py
│           │       ├── ank3.py
│           │       ├── scn1a.py
│           │       └── parameter_suggestions.py
│           │   └── nutrigenomics/
│           │       ├── __init__.py
│           │       ├── mthfr.py
│           │       ├── vdr.py
│           │       ├── fads.py
│           │       ├── apoe.py
│           │       ├── supplementation.py
│           │       └── methylation.py
│           └── tests/
│               ├── __init__.py
│               ├── test_router.py
│               ├── test_models.py
│               ├── test_analysis_engine.py
│               ├── test_metabolism.py
│               ├── test_psychiatric.py
│               ├── test_neuromodulation.py
│               ├── test_nutrigenomics.py
│               ├── test_drug_interactions.py
│               ├── test_report_generator.py
│               ├── test_consent.py
│               ├── test_audit.py
│               ├── test_vcf_parser.py
│               ├── test_safe_wording.py
│               └── test_fhir_adapter.py
├── apps/
│   └── web/
│       └── src/
│           └── gma/
│               ├── index.ts
│               ├── types.ts                   # TypeScript type definitions
│               ├── api.ts                     # API client functions
│               ├── store.ts                   # Zustand store
│               ├── dashboard/
│               │   ├── GmaDashboardPage.tsx   # 412 lines
│               │   └── components/
│               │       ├── ProfileSummaryCard.tsx
│               │       ├── RiskSummaryPanel.tsx
│               │       ├── MetabolizerOverview.tsx
│               │       ├── RecentAnalysisList.tsx
│               │       ├── QuickActionBar.tsx
│               │       └── SafetyBanner.tsx
│               ├── gene-browser/
│               │   ├── GeneBrowserPage.tsx    # 356 lines
│               │   └── components/
│               │       ├── GeneSearchBar.tsx
│               │       ├── GeneCard.tsx
│               │       ├── GeneDetailView.tsx
│               │       ├── PopulationFrequencyChart.tsx
│               │       └── StarAlleleTable.tsx
│               ├── interactions/
│               │   ├── DrugInteractionPage.tsx # 398 lines
│               │   └── components/
│               │       ├── InteractionMatrix.tsx
│               │       ├── InteractionCard.tsx
│               │       ├── SeverityFilter.tsx
│               │       ├── GeneDrugSearch.tsx
│               │       ├── ExportPanel.tsx
│               │       └── EvidenceBadge.tsx
│               ├── metabolizer/
│               │   ├── MetabolizerPage.tsx    # 287 lines
│               │   └── components/
│               │       ├── PhenotypeCalculator.tsx
│               │       ├── ActivityScoreGauge.tsx
│               │       ├── PhenotypeCard.tsx
│               │       └── DrugImpactTable.tsx
│               ├── psychiatric/
│               │   ├── PsychiatricPage.tsx    # 334 lines
│               │   └── components/
│               │       ├── ConditionSelector.tsx
│               │       ├── MedicationClassSelector.tsx
│               │       ├── ResponsePredictionCard.tsx
│               │       ├── GeneVariantPanel.tsx
│               │       └── EvidenceDisplay.tsx
│               ├── neuromodulation/
│               │   ├── NeuromodulationPage.tsx # 267 lines
│               │   └── components/
│               │       ├── ModalitySelector.tsx
│               │       ├── ResponsePredictionCard.tsx
│               │       ├── ParameterSuggestion.tsx
│               │       ├── ContraindicationAlert.tsx
│               │       └── ProtocolHubLink.tsx
│               ├── nutrigenomics/
│               │   ├── NutrigenomicsPage.tsx  # 290 lines
│               │   └── components/
│               │       ├── MthfrPanel.tsx
│               │       ├── MethylationVisualizer.tsx
│               │       ├── SupplementCard.tsx
│               │       ├── HomocysteineIndicator.tsx
│               │       └── NutritionPlan.tsx
│               └── settings/
│                   ├── GmaSettingsPage.tsx    # 300 lines
│                   └── components/
│                       ├── ConsentManager.tsx
│                       ├── AncestrySelector.tsx
│                       ├── ExportPreferences.tsx
│                       ├── PrivacySettings.tsx
│                       └── NotificationPrefs.tsx
├── research/
│   ├── 01_cyp450_core_metabolism.md           # 3,847 lines
│   ├── 02_psychiatric_response_genetics.md    # 4,231 lines
│   ├── 03_neuromodulation_genetics.md         # 2,984 lines
│   ├── 04_nutrigenomics_panel.md              # 3,156 lines
│   ├── 05_drug_gene_interaction_matrix.md     # 4,512 lines
│   ├── 06_pediatric_pharmacogenomics.md       # 2,108 lines
│   ├── 07_geriatric_pharmacogenomics.md       # 2,345 lines
│   ├── 08_ancestry_population_genetics.md     # 2,618 lines
│   └── 09_safety_framework.md                 # 2,580 lines
└── docs/
    ├── API_REFERENCE.md
    ├── CLINICAL_INTEGRATION.md
    ├── DEPLOYMENT.md
    ├── DEVELOPER_SETUP.md
    ├── FRONTEND_ARCHITECTURE.md
    ├── PRIVACY_AND_SECURITY.md
    └── USER_GUIDE.md
```

### Appendix K: Regulatory Compliance

| Regulation | Requirement | Implementation |
|-----------|-------------|---------------|
| **HIPAA** | PHI protection | AES-256 encryption, BAAs, access controls |
| **FDA SaMD** | Software as Medical Device classification | Class II -- Decision support, not diagnostic |
| **CLIA** | Laboratory testing standards | Integration with CLIA-certified labs only |
| **CPIC** | Pharmacogenomic guideline adherence | All CPIC guidelines implemented |
| **21 CFR Part 11** | Electronic records for clinical trials | Audit trail, e-signatures available |
| **GDPR** | EU data protection | Consent management, right to deletion, data portability |
| **ISO 13485** | Medical device QMS | Quality management procedures |
| **State Licensing** | Genetic counseling requirements | Clinician-facing only; no direct-to-consumer |

### Appendix L: Research Data Sources

| Source | Type | Coverage | Update Frequency |
|--------|------|----------|-----------------|
| **CPIC** | Clinical guidelines | 20+ gene-drug guidelines | Quarterly |
| **PharmGKB** | Gene-drug database | 400+ genes, 600+ drugs | Daily |
| **FDA Biomarker Table** | Regulatory | 300+ biomarker-drug pairs | Periodic |
| **PubMed** | Literature | 35M+ citations | Daily |
| **gnomAD** | Population frequencies | 800K+ genomes | Annual |
| **1000 Genomes** | Population diversity | 2,500+ genomes | Static (updated) |
| **DPWG** | International guidelines | 80+ gene-drug pairs | Annual |
| **Cochrane Library** | Systematic reviews | 10,000+ reviews | Monthly |
| **ClinicalTrials.gov** | Trial registry | 400K+ trials | Daily |
| **PharmaGKB-CPIC** | Curated evidence | CPIC guideline variants | Quarterly |

---

## Document Metadata

| Field | Value |
|-------|-------|
| **Document Title** | World-Class Genetic Medication Analyzer -- Integrated Roadmap |
| **Version** | 1.0.0 |
| **Classification** | Clinical Decision Support -- Internal |
| **Author** | DeepSynaps Protocol Studio Pharmacogenomics Team |
| **Date Created** | 2026-05-14 |
| **Last Updated** | 2026-05-14 |
| **Status** | Production Roadmap |
| **Review Cycle** | Quarterly |
| **Next Review** | 2026-08-14 |
| **Approved By** | Clinical Advisory Board |
| **Evidence Cutoff Date** | 2026-04-30 |
| **CPIC Version Reference** | 2024 Q4 |
| **FDA Biomarker Table Reference** | 2024 Update |

---

> **FINAL NOTICE:** This roadmap is a living document. All clinical content is evidence-based and sourced from peer-reviewed publications, CPIC guidelines, and FDA pharmacogenomic biomarker tables. Implementation must prioritize patient safety, clinician decision-support framing, and regulatory compliance at all times. Genetic testing results are one of many factors influencing medication response and must always be interpreted within the full clinical context by qualified healthcare professionals.


---

## Appendix M: Detailed Gene Reference Tables

### M.1 CYP2D6 Star Allele Reference Table

| Star Allele | rsID(s) | Function | Activity Value | Effect | Frequency (EUR) | Frequency (AFR) | Frequency (EAS) |
|-------------|---------|----------|---------------|--------|-----------------|-----------------|-----------------|
| *1 | Reference | Normal function | 1.0 | None | 60-70% | 30-40% | 40-50% |
| *2 | rs16947, rs1135840 | Normal function | 1.0 | None | 20-25% | 20-30% | 10-15% |
| *3 | rs35742686 | No function | 0 | Splicing defect | 1-2% | 0-1% | 0-1% |
| *4 | rs3892097 | No function | 0 | Splicing defect | 15-20% | 3-5% | 0-1% |
| *5 | Gene deletion | No function | 0 | Entire gene deleted | 2-5% | 1-3% | 2-4% |
| *6 | rs5030655 | No function | 0 | Frameshift | 1-2% | 0-1% | 0-1% |
| *9 | rs5030653 | Decreased function | 0.5 | 2615_2617delAAG | 1-3% | 1-2% | 0% |
| *10 | rs1065852, rs5030656 | Decreased function | 0.25 | P34S + Splicing | 1-3% | 1-3% | 50-70% |
| *14 | rs5030865, rs5030862 | Decreased function | 0.25 | G169R + frameshift | 0% | 3-8% | 0% |
| *17 | rs28371706, rs16947 | Decreased function | 0.5 | Multiple changes | 0% | 15-25% | 0% |
| *29 | rs61736512, rs16947 | Decreased function | 0.5 | R150C + H158R | 0% | 5-10% | 0% |
| *41 | rs28371725, rs16947 | Decreased function | 0.25 | Splicing defect | 5-10% | 5-8% | 0-2% |
| *1xn | Gene duplication | Increased function | >1.0 | Multiple gene copies | 1-3% | 1-2% | 0-1% |
| *2xn | Gene duplication | Increased function | >1.0 | Multiple gene copies | 1-2% | 1-2% | 0-1% |

### M.2 CYP2C19 Star Allele Reference Table

| Star Allele | rsID(s) | Function | Activity Value | Effect | Frequency (EUR) | Frequency (AFR) | Frequency (EAS) |
|-------------|---------|----------|---------------|--------|-----------------|-----------------|-----------------|
| *1 | Reference | Normal function | 1.0 | None | 60-65% | 50-60% | 40-50% |
| *2 | rs4244285 | No function | 0 | Splicing defect | 12-15% | 10-15% | 25-35% |
| *3 | rs4986893 | No function | 0 | W212X stop codon | 0-1% | 0-1% | 6-10% |
| *4 | rs28399504 | No function | 0 | I331V splicing | 0% | 0-1% | 0% |
| *5 | rs56337013 | No function | 0 | R433W | 0% | 0% | 0% |
| *6 | rs72552267 | No function | 0 | R132Q | 0% | 0% | 0% |
| *7 | rs72558186 | No function | 0 | Frameshift | 0% | 0% | 0% |
| *8 | rs41291556 | No function | 0 | W120X | 0% | 0% | 0% |
| *9 | rs17884712 | Decreased function | 0.5 | R144H | 0-1% | 0-1% | 0% |
| *10 | rs6413438 | Decreased function | 0.5 | I331V | 0% | 0-1% | 0-1% |
| *17 | rs12248560 | Increased function | >1.0 | -806C>T promoter | 15-20% | 15-25% | 3-5% |

### M.3 Activity Score to Phenotype Mapping

| Gene | Activity Score | Phenotype | Clinical Category |
|------|---------------|-----------|-------------------|
| CYP2D6 | 0 | Poor Metabolizer (PM) | Significantly reduced |
| CYP2D6 | 0.25-0.5 | Intermediate Metabolizer (IM) | Reduced |
| CYP2D6 | 0.75-1.25 | Normal Metabolizer (NM) | Standard |
| CYP2D6 | 1.5-2.0 | Normal Metabolizer (NM) | Standard |
| CYP2D6 | >2.0 | Ultra-Rapid Metabolizer (UM) | Increased |
| CYP2C19 | 0 | Poor Metabolizer (PM) | Significantly reduced |
| CYP2C19 | 0.25-0.75 | Intermediate Metabolizer (IM) | Reduced |
| CYP2C19 | 1.0-1.25 | Normal Metabolizer (NM) | Standard |
| CYP2C19 | 1.5-2.0 | Rapid Metabolizer (RM) | Increased |
| CYP2C19 | >2.0 | Ultra-Rapid Metabolizer (UM) | Significantly increased |
| CYP2B6 | 0-0.5 | Slow Metabolizer | Significantly reduced |
| CYP2B6 | 0.75-1.25 | Intermediate Metabolizer | Reduced |
| CYP2B6 | 1.5-2.0 | Normal Metabolizer | Standard |
| CYP2B6 | >2.0 | Ultra-Rapid Metabolizer | Increased |

---

## Appendix N: Comprehensive Drug List

### N.1 SSRIs (Selective Serotonin Reuptake Inhibitors)

| Drug | CYP2D6 | CYP2C19 | CYP3A4 | Primary PGx | Evidence |
|------|--------|---------|--------|-------------|----------|
| Citalopram | Minor substrate | Major substrate (dose) | Minor | CYP2C19 | A |
| Escitalopram | Minor substrate | Major substrate (dose) | Minor | CYP2C19 | A |
| Fluoxetine | Strong inhibitor | Moderate inhibitor | Moderate substrate | CYP2D6, CYP2C19 | B |
| Fluvoxamine | Moderate inhibitor | Strong inhibitor | Moderate inhibitor | CYP2C19, CYP1A2 | B |
| Paroxetine | Strong substrate + inhibitor | Moderate substrate | Minor | CYP2D6 | A |
| Sertraline | Moderate substrate | Major substrate | Minor | CYP2C19 | B |

### N.2 SNRIs (Serotonin-Norepinephrine Reuptake Inhibitors)

| Drug | CYP2D6 | CYP2C19 | CYP3A4 | Primary PGx | Evidence |
|------|--------|---------|--------|-------------|----------|
| Venlafaxine | Major substrate | Minor | Minor | CYP2D6 | B |
| Desvenlafaxine | Minor substrate | Minor | Minor | CYP2D6 | B |
| Duloxetine | Major substrate | Minor | Minor | CYP2D6 | B |
| Milnacipran | Minor | Minor | Minor | Limited | C |
| Levomilnacipran | Major substrate | Minor | Minor | CYP2D6 | C |

### N.3 TCAs (Tricyclic Antidepressants)

| Drug | CYP2D6 | CYP2C19 | CYP3A4 | Primary PGx | Evidence |
|------|--------|---------|--------|-------------|----------|
| Amitriptyline | Major substrate | Major substrate | Minor | CYP2D6, CYP2C19 | A |
| Nortriptyline | Major substrate | Minor | Minor | CYP2D6 | A |
| Imipramine | Major substrate | Major substrate | Minor | CYP2D6, CYP2C19 | A |
| Desipramine | Major substrate | Minor | Minor | CYP2D6 | A |
| Clomipramine | Major substrate | Major substrate | Minor | CYP2D6, CYP2C19 | A |
| Doxepin | Major substrate | Major substrate | Minor | CYP2D6, CYP2C19 | B |

### N.4 Atypical Antipsychotics

| Drug | CYP2D6 | CYP2C19 | CYP3A4 | CYP1A2 | Primary PGx | Evidence |
|------|--------|---------|--------|--------|-------------|----------|
| Aripiprazole | Major substrate | Minor | Major substrate | Minor | CYP2D6, CYP3A4 | B |
| Risperidone | Major substrate | Minor | Minor | Minor | CYP2D6, DRD2 | B |
| Olanzapine | Minor | Minor | Minor | Major substrate | CYP1A2, CYP2D6 | B |
| Quetiapine | Minor | Minor | Major substrate | Major substrate | CYP3A4, CYP2D6 | B |
| Clozapine | Major substrate | Minor | Minor | Major substrate | CYP1A2, CYP2D6, CYP3A4 | C |
| Ziprasidone | Minor | Minor | Major substrate | Minor | CYP3A4 | C |
| Lurasidone | Minor | Minor | Major substrate | Minor | CYP3A4 | C |
| Brexpiprazole | Major substrate | Minor | Major substrate | Minor | CYP2D6, CYP3A4 | C |
| Cariprazine | Major substrate | Minor | Major substrate | Minor | CYP2D6, CYP3A4 | C |
| Asenapine | Minor | Minor | Major substrate | Minor | CYP3A4, CYP1A2 | C |

### N.5 Mood Stabilizers

| Drug | CYP Enzymes | Primary PGx | Key Interaction | Evidence |
|------|------------|-------------|----------------|----------|
| Lithium | Renal excretion | Limited | NEPN gene variants | C |
| Valproic acid | Multiple (UGT, beta-oxidation) | Limited | UGT polymorphisms | C |
| Carbamazepine | CYP3A4 (autoinducer), CYP2C8 | HLA-B*15:02 | SJS/TEN risk | A |
| Oxcarbazepine | CYP3A4, CYP2C19 | HLA-B*15:02 | SJS/TEN risk | A |
| Lamotrigine | UGT1A4, UGT2B7 | UGT1A4 | Clearance variation | C |
| Topiramate | Limited metabolism | Limited | Carbonic anhydrase | C |

### N.6 ADHD Medications

| Drug | CYP2D6 | CYP2C19 | CYP1A2 | Primary PGx | Evidence |
|------|--------|---------|--------|-------------|----------|
| Methylphenidate | CES1 | Minor | Minor | CES1, ADRA2A | B |
| Amphetamine | CYP2D6 (minor) | Minor | Minor | ADRA2A, SLC6A2 | B |
| Atomoxetine | Major substrate | Minor | Minor | CYP2D6 | A |
| Guanfacine ER | CYP3A4 | Minor | Minor | CYP3A4, ADRA2A | B |
| Clonidine | Minor (CYP2D6) | Minor | Minor | ADRA2A | C |
| Lisdexamfetamine | CYP2D6 (minor) | Minor | Minor | ADRA2A | B |

### N.7 Opioid Analgesics

| Drug | CYP2D6 | CYP3A4 | Prodrug? | Primary PGx | Evidence |
|------|--------|--------|----------|-------------|----------|
| Codeine | Major (activation) | Minor | Yes | CYP2D6 | A |
| Tramadol | Major (activation) | Major substrate | Yes | CYP2D6, CYP2B6 | A |
| Oxycodone | Minor | Major substrate | No | CYP3A4, CYP2D6 | B |
| Morphine | UGT2B7 | Minor | No | OPRM1, UGT2B7 | B |
| Hydrocodone | Minor (activation) | Major substrate | Yes | CYP2D6, CYP3A4 | B |
| Fentanyl | Minor | Major substrate | No | CYP3A4 | B |
| Methadone | CYP2B6 (major), CYP3A4, CYP2C19 | Major substrate | No | CYP2B6 | B |
| Buprenorphine | CYP3A4, CYP2C8 | Major substrate | No | CYP3A4 | C |
| Tapentadol | Minor | Minor | No | Limited | C |

### N.8 Benzodiazepines

| Drug | CYP2C19 | CYP3A4 | Glucuronidation | Primary PGx | Evidence |
|------|---------|--------|-----------------|-------------|----------|
| Diazepam | Major substrate | Minor | Minor | CYP2C19 | B |
| Clonazepam | Minor | Major substrate | Minor | CYP3A4 | C |
| Lorazepam | Minor | Minor | Major (UGT) | Limited | C |
| Alprazolam | Minor | Major substrate | Minor | CYP3A4 | C |
| Midazolam | Minor | Major substrate | Minor | CYP3A4 | B |
| Temazepam | Minor | Minor | Major (UGT) | Limited | C |
| Oxazepam | Minor | Minor | Major (UGT) | Limited | C |

---

## Appendix O: Test Suite Specification

### O.1 Backend Test Coverage

| Test Module | Test Count | Target Coverage | Priority |
|------------|-----------|----------------|----------|
| Router/Endpoints | 32 | 100% | Critical |
| Pydantic Models | 24 | 100% | Critical |
| CYP2D6 Metabolizer | 18 | 95% | Critical |
| CYP2C19 Metabolizer | 16 | 95% | Critical |
| CYP2B6 Metabolizer | 12 | 90% | High |
| CYP3A4/5 Metabolizer | 14 | 90% | High |
| CYP1A2 Metabolizer | 10 | 85% | Medium |
| Drug Interaction Matrix | 28 | 95% | Critical |
| SLC6A4 Psychiatric | 10 | 85% | Medium |
| HTR2A Psychiatric | 10 | 85% | Medium |
| COMT Psychiatric | 8 | 85% | Medium |
| DRD2 Psychiatric | 8 | 85% | Medium |
| BDNF Neuromodulation | 10 | 80% | Medium |
| GRIK4 Neuromodulation | 8 | 80% | Medium |
| MTHFR Nutrigenomics | 12 | 90% | High |
| VDR Nutrigenomics | 8 | 80% | Medium |
| Report Generator | 14 | 90% | High |
| Consent Service | 10 | 100% | Critical |
| Audit Service | 8 | 100% | Critical |
| VCF Parser | 12 | 90% | High |
| Safe Wording | 16 | 100% | Critical |
| FHIR Adapter | 10 | 85% | Medium |
| **TOTAL** | **318** | **90%+** | |

### O.2 Frontend Test Coverage

| Test Module | Test Count | Target Coverage | Priority |
|------------|-----------|----------------|----------|
| Dashboard Page | 12 | 80% | High |
| Gene Browser | 10 | 75% | Medium |
| Drug Interaction Matrix | 14 | 80% | High |
| Metabolizer Calculator | 10 | 80% | High |
| Psychiatric Response | 8 | 70% | Medium |
| Neuromodulation Response | 8 | 70% | Medium |
| Nutrigenomics Panel | 8 | 70% | Medium |
| Settings & Consent | 10 | 80% | High |
| Shared Components | 6 | 75% | Medium |
| E2E Workflows | 16 | -- | Critical |
| **TOTAL** | **102** | **75%+** | |

### O.3 E2E Test Scenarios

| # | Scenario | Steps | Expected Result |
|---|----------|-------|----------------|
| 1 | Complete analysis workflow | Upload profile > Run analysis > View results > Generate report | All modules populate correctly |
| 2 | Major drug interaction alert | Enter CYP2D6 PM + Codeine | Red major interaction displayed |
| 3 | Consent enforcement | Attempt analysis without consent | Blocked with clear message |
| 4 | Pediatric analysis | Enter age <18 + genetic profile | Pediatric warnings displayed |
| 5 | Ancestry-specific analysis | Select African ancestry | African population frequencies shown |
| 6 | VCF upload and parse | Upload 23andMe format VCF | Variants extracted and classified |
| 7 | Report generation | Run analysis > Generate PDF | Complete PDF report generated |
| 8 | Gene browser navigation | Browse > Search CYP2D6 > View details | Full gene information displayed |
| 9 | Metabolizer calculation | Enter *1/*4 > Calculate | Correct PM phenotype displayed |
| 10 | Nutrigenomics analysis | Enter MTHFR 677TT | L-methylfolate recommendation shown |
| 11 | Clinician review workflow | Generate report > Mark reviewed | Review status updated |
| 12 | Patient portal summary | Login as patient > View results | Simplified summary shown |
| 13 | Settings update | Change ancestry > Re-run analysis | Updated population frequencies |
| 14 | Export functionality | View results > Export CSV | Correct CSV file downloaded |
| 15 | Print report | View report > Print | Print-friendly format displayed |
| 16 | Audit trail | Run analysis > Check audit log | All events logged correctly |

---

## Appendix P: Clinical Decision Support Integration

### P.1 CDS Hooks Integration

| Hook | Context | Payload | Response |
|------|---------|---------|----------|
| `medication-prescribe` | Clinician prescribes medication | Patient genetic profile, proposed medication | Interaction alerts if gene-drug conflict |
| `patient-view` | Clinician opens patient chart | Patient ID | Genetic profile summary card |
| `order-sign` | Clinician orders genetic test | Patient demographics, indication | Pre-test probability guidance |
| `encounter-start` | New patient encounter | Patient ID | Pending genetic review alerts |

### P.2 HL7 FHIR Integration

| Resource | Profile | Usage |
|----------|---------|-------|
| `Observation` | Pharmacogenomic Observation | Store metabolizer phenotypes |
| `DiagnosticReport` | Pharmacogenomic Report | Store analysis results |
| `ServiceRequest` | Genetic Test Order | Order pharmacogenomic testing |
| `Patient` | Extended with ancestry | Ancestry for population context |
| `MedicationRequest` | Extended with PGx | Medication with genetic context |
| `Task` | Genetic Review Task | Flag for clinician review |

### P.3 EHR Integration Points

| EHR System | Integration Method | Data Flow | Status |
|-----------|-------------------|-----------|--------|
| Epic | FHIR R4 + CDS Hooks | Bidirectional | Planned |
| Cerner | FHIR R4 | Bidirectional | Planned |
| Meditech | HL7 v2 + FHIR | Unidirectional (out) | Planned |
| athenahealth | FHIR R4 | Bidirectional | Planned |
| Allscripts | FHIR R4 | Bidirectional | Planned |

---

## Appendix Q: Performance Specifications

| Metric | Target | Stress Test |
|--------|--------|-------------|
| API response time (p50) | <200ms | 1000 req/sec |
| API response time (p99) | <500ms | 1000 req/sec |
| Analysis completion | <3 seconds | Full 36-gene panel |
| Report generation (PDF) | <10 seconds | Comprehensive report |
| VCF parsing | <5 seconds | 1M variants |
| Database query time (p99) | <50ms | Complex joins |
| Frontend initial load | <2 seconds | Dashboard page |
| Frontend interaction | <100ms | Filter/sort operations |
| Concurrent users | 500+ | Load tested |
| Uptime SLA | 99.9% | Monthly |

---

## Appendix R: Risk Register

| Risk ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---------|------|-----------|--------|-----------|-------|
| R01 | Clinician misinterprets genetic results as definitive | Medium | Critical | Safe wording, disclaimers, evidence grades, training | Clinical Lead |
| R02 | Patient acts on genetic information without clinician | Medium | Critical | Patient portal restrictions, mandatory clinician review | Safety Officer |
| R03 | Outdated evidence leads to incorrect recommendations | Low | High | Daily evidence sync, version control, evidence dates | Evidence Lead |
| R04 | Wrong ancestry assumed leading to incorrect frequencies | Low | High | Mandatory ancestry selection, multi-ancestry default | Data Lead |
| R05 | VCF parsing errors produce incorrect variant calls | Low | Critical | Validation pipeline, quality scoring, manual review option | Engineering |
| R06 | Consent not properly enforced | Low | Critical | Multi-layer consent checks, audit logging, automated testing | Compliance |
| R07 | Data breach of genetic information | Low | Critical | AES-256 encryption, access controls, audit trail, BAAs | Security |
| R08 | System incorrectly labels D-grade as actionable | Low | Critical | Automated evidence grade checks, research-only badges | Safety Officer |
| R09 | Polypharmacy interactions missed | Medium | High | Complete interaction matrix, DDI + gene interaction checking | Clinical Lead |
| R10 | Pediatric analysis uses adult data | Low | High | Age validation, pediatric-specific module, warnings | Clinical Lead |
| R11 | Regulatory changes invalidate content | Medium | Medium | Quarterly review, automated CPIC/FDA monitoring | Compliance |
| R12 | API performance degradation | Medium | Medium | Caching, rate limiting, horizontal scaling | Engineering |

---

## Appendix S: Training and Documentation Plan

### S.1 Clinician Training

| Module | Duration | Format | Audience |
|--------|----------|--------|----------|
| Platform Overview | 30 min | Video + Quiz | All clinicians |
| Genetic Results Interpretation | 60 min | Video + Case Studies | Prescribers |
| Safe Wording and Communication | 30 min | Video + Practice | All clinical staff |
| Evidence Grade Understanding | 20 min | Video + Quiz | All clinical staff |
| Pediatric Considerations | 30 min | Video + Case Studies | Pediatric providers |
| Geriatric Considerations | 30 min | Video + Case Studies | Geriatric providers |
| Platform Administration | 45 min | Video + Hands-on | Administrators |

### S.2 Patient Education Materials

| Material | Format | Reading Level | Languages |
|----------|--------|--------------|-----------|
| "What is Pharmacogenomic Testing?" | Brochure (PDF) | 6th grade | EN, ES, FR, DE, ZH |
| "Understanding Your Results" | Guide (PDF) | 6th grade | EN, ES, FR, DE, ZH |
| "Genetics and Your Medications" | Video (5 min) | N/A | EN, ES |
| "Talking to Your Doctor" | Checklist (PDF) | 6th grade | EN, ES, FR, DE, ZH |
| "Privacy and Your Genetic Data" | Handout (PDF) | 8th grade | EN, ES, FR, DE, ZH |

---

## Appendix T: Internationalization Plan

| Language | UI | Reports | Evidence | Target |
|----------|-----|---------|----------|--------|
| English (US) | Yes | Yes | Yes | Launch |
| English (UK) | Yes | Yes | Partial | Launch |
| Spanish | Yes | Yes | No | 6 months |
| French | Yes | Summary | No | 6 months |
| German | Yes | Summary | No | 6 months |
| Mandarin Chinese | Yes | Summary | No | 12 months |
| Japanese | Yes | Summary | No | 12 months |
| Portuguese | Yes | Summary | No | 12 months |
| Arabic | Yes | Summary | No | 18 months |
| Hindi | Yes | Summary | No | 18 months |

---

## Appendix U: Quality Assurance Checklist

### Pre-Launch QA

| Check | Description | Status Criteria |
|-------|-------------|----------------|
| API endpoint tests | All 16 endpoints tested | 100% pass rate |
| Model validation | All 10 Pydantic models | 100% validation coverage |
| Metabolizer accuracy | 50+ test diplotypes | 100% match CPIC calculator |
| Drug interaction accuracy | 200+ gene-drug pairs | 100% match PharmGKB |
| Safe wording enforcement | All 11 templates | Automated text analysis pass |
| Consent enforcement | All analysis paths | Blocked without valid consent |
| Evidence grade accuracy | All graded content | Matches source database |
| Ancestry context | All population frequencies | Matches gnomAD/1000G |
| Report generation | All report types | Complete, accurate, formatted |
| Security audit | Penetration testing | No critical or high vulnerabilities |
| Performance testing | All API endpoints | Meet p50/p99 targets |
| Accessibility audit | WCAG 2.1 AA | No critical issues |
| Clinical safety review | Expert panel review | Approved for decision-support |
| Regulatory review | Compliance check | HIPAA, state licensing compliant |

---

*End of World-Class Genetic Medication Analyzer -- Integrated Roadmap*
