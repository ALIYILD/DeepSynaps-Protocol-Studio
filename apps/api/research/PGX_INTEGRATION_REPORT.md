# DeepSynaps Protocol Studio - Pharmacogenomics (PGx) Integration Report

**Document ID**: PGX-INT-2025-001  
**Version**: 1.0.0  
**Phase**: PHASE 1 - Knowledge Layer  
**Repository**: /data/DeepSynaps-Protocol-Studio  
**Classification**: Technical Integration Specification  
**Last Updated**: 2025-07-29  
**Contributors**: DeepSynaps Research Division  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [PharmGKB Deep Dive](#2-pharmgkb-deep-dive)
3. [CPIC Guidelines Analysis](#3-cpic-guidelines-analysis)
4. [ClinVar Integration](#4-clinvar-integration)
5. [PharmCAT Pipeline](#5-pharmcat-pipeline)
6. [Psychiatric PGx Evidence](#6-psychiatric-pgx-evidence)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Provenance & Confidence Model](#8-provenance--confidence-model)
9. [Licensing Matrix](#9-licensing-matrix)
10. [Implementation Recommendations](#10-implementation-recommendations)
11. [Clinical Safety Rules](#11-clinical-safety-rules)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

This report provides the foundational research for integrating pharmacogenomic (PGx) knowledge into the DeepSynaps Protocol Studio clinical neuromodulation platform. The Knowledge Layer (Phase 1) aims to incorporate gene-drug interaction data from PharmGKB, CPIC guidelines, ClinVar variant annotations, and PharmCAT phenotype translation pipelines to support clinical decision-making for psychiatric medication management in the context of neuromodulation therapy.

### Key Findings

- **PharmGKB** (now ClinPGx): Hosts 44 Very Important Pharmacogenes (VIP), including CYP2D6, CYP2C19, CYP3A4/5, HLA-B, and SLCO1B1 -- all critical for psychiatric pharmacotherapy. Clinical annotations are scored on a 6-level evidence scale (1A through 4). Data is available via REST API and bulk TSV/VCF downloads under CC BY-SA 4.0 licensing.

- **CPIC Guidelines**: Currently provides actionable, gene-based dosing recommendations for over 25 gene-drug pairs. For psychiatry specifically, CPIC publishes strong evidence for CYP2D6 (paroxetine, fluvoxamine, vortioxetine, venlafaxine), CYP2C19 (citalopram, escitalopram, sertraline), CYP2B6 (sertraline), and HLA-B (carbamazepine/oxcarbazepine SJS/TEN risk). Each recommendation carries a classification (Strong, Moderate, Optional, No Recommendation).

- **ClinVar**: NCBI's variant archive containing >2.5 million submissions. The 4-star review status system provides critical confidence assessment. The E-utilities API supports programmatic access with rate limits of 3 req/sec (unauthenticated) and 10 req/sec (with API key). Psychiatric pharmacogenomic variants of interest include CYP2D6*3-*6, *10, *17, *41; CYP2C19*2, *3, *17; and HLA-B*15:02. All ClinVar data is public domain.

- **PharmCAT**: Open-source Java pipeline (Apache 2.0) that translates VCF genotype data into CPIC/DPWG phenotype-driven clinical recommendations. Outputs JSON reports that can be programmatically consumed. Supports 20+ pharmacogenes but requires external tools (e.g., StellarPGx) for reliable CYP2D6 calling due to structural variation.

- **Psychiatric PGx Evidence**: CYP2D6 PMs require 50% dose reduction for paroxetine and vortioxetine. CYP2C19 PMs should avoid or receive 50% reduced doses of citalopram/escitalopram. HLA-B*15:02 positive patients should not receive carbamazepine (strong recommendation). SLCO1B1 521T>C (rs4149056) carriers have increased simvastatin myopathy risk. Antipsychotic metabolism varies significantly by CYP1A2, CYP2D6, and CYP3A4 genotype.

- **Integration Architecture**: A multi-tier pipeline is proposed: (1) Variant ingestion from VCF/TSV, (2) PharmCAT genotype-to-phenotype translation, (3) CPIC guideline lookup, (4) PharmGKB clinical annotation overlay, (5) ClinVar variant significance cross-reference, (6) Confidence scoring, and (7) CDS display with research-only flagging for low-evidence associations.

---

## 2. PharmGKB Deep Dive

### 2.1 Overview

The Pharmacogenomics Knowledgebase (PharmGKB), now transitioned to ClinPGx (Clinical Pharmacogenomics), is a NIH-funded resource that curates knowledge about the impact of genetic variation on drug response. It is the primary hosting platform for CPIC guidelines and provides structured annotations linking genetic variants to drug efficacy, toxicity, and dosing.

### 2.2 Clinical Annotation Levels

PharmGKB clinical annotations use a 6-tier evidence classification system. Each level reflects the strength of evidence supporting a variant-drug association:

| Level | Score Range (Standard) | Score Range (Rare Variant) | Description |
|-------|----------------------|--------------------------|-------------|
| **1A** | >= 80 | >= 80 | Variant-specific prescribing guidance exists in a current clinical guideline (CPIC/DPWG) **or** FDA-approved drug label. Requires >=1 variant annotation from literature PLUS actionable guidance. |
| **1B** | 25-79.9375 | 10-79.9375 | High evidence supporting the association but NO variant-specific prescribing guidance in a guideline or drug label. Requires >=2 independent publications. |
| **2A** | 8-24.9375 | 3-9.9375 | Moderate evidence. Variant is in a **Tier 1 VIP gene**. Association replicated but some negative studies may exist. Requires >=2 independent publications. |
| **2B** | 8-24.9375 | 3-9.9375 | Moderate evidence. Variant is **NOT** in a Tier 1 VIP gene. Same replication requirements as 2A. |
| **3** | Varies | Varies | Low evidence. Based on a single study, multiple studies with conflicting results, case reports, in vitro studies, or studies that did not reach significance. |
| **4** | Varies | Varies | Annotation where the **preponderance of evidence does NOT support** an association. |

#### Clinical Annotation Scoring Mechanics

Each clinical annotation receives a numeric score based on:
- **Variant annotations from literature**: Each supporting publication contributes points based on study size, P-value (after correction), effect size (odds ratio), and replication status.
- **PGx guideline annotations**: +100 points per actionable CPIC/DPWG guideline that provides variant-specific prescribing guidance.
- **Drug label annotations**: +100 points per FDA-approved drug label with variant-specific guidance.

#### Level 1A Auto-Promotion Rule

If a clinical annotation has an existing literature-supported score and an actionable guideline or drug label is subsequently annotated, +100 points are added, automatically promoting the annotation to Level 1A. This reflects PharmGKB's position that authoritative prescribing guidance represents the highest tier of evidence.

### 2.3 Very Important Pharmacogene (VIP) Summaries

PharmGKB identifies 44 Very Important Pharmacogenes (VIP) classified into three tiers:

| Tier | Count | Description | Examples |
|------|-------|-------------|----------|
| **Tier 1** | 34 | Genes with considerable evidence of clinical pharmacogenomic relevance | CYP2D6, CYP2C19, CYP2C9, CYP3A4, CYP3A5, HLA-B, SLCO1B1, CYP1A2, CYP2B6 |
| **Tier 2** | 25 | Genes with limited evidence | ADRB1, CHRNA5, COMT, DRD2, TYMS |
| **Cancer Genome** | 9 | Genes affecting anticancer drug efficacy/toxicity | EGFR, DPYD, TPMT, UGT1A1 |

#### Key VIP Genes for Psychiatry/Neurology

| Gene | Tier | Relevant Drug Classes | CPIC Guidelines | Notes |
|------|------|----------------------|-----------------|-------|
| **CYP2D6** | Tier 1 | SSRIs, SNRIs, antipsychotics, TCAs, opioids | Yes (SSRIs, TCAs, atomoxetine, codeine, tramadol) | ~7% PM, ~3% UM in Europeans |
| **CYP2C19** | Tier 1 | SSRIs (citalopram, escitalopram, sertraline), TCAs, PPIs, clopidogrel | Yes (SSRIs, TCAs, clopidogrel, voriconazole) | ~2-5% PM, ~15-25% IM globally |
| **CYP2C9** | Tier 1 | NSAIDs, warfarin, phenytoin, sulfonylureas | Yes (warfarin, phenytoin) | Less relevant for psychiatry |
| **CYP3A4** | Tier 1 | Antipsychotics, benzodiazepines, many CNS drugs | In progress | Major metabolic enzyme |
| **CYP3A5** | Tier 1 | Tacrolimus, some antipsychotics | Yes (tacrolimus) | Population-dependent expression |
| **CYP1A2** | Tier 1 | Clozapine, olanzapine, fluvoxamine | No formal CPIC yet | Smoking status interacts |
| **HLA-B** | Tier 1 | Carbamazepine, oxcarbazepine, abacavir, allopurinol | Yes (carbamazepine/oxcarbazepine, abacavir) | SJS/TEN risk |
| **SLCO1B1** | Tier 1 | Statins (simvastatin) | Yes (simvastatin) | Myopathy risk |
| **CYP2B6** | Tier 1 | Sertraline, efavirenz, methadone, bupropion | Yes (efavirenz, sertraline) | Important for sertraline |

### 2.4 Data Model: Variant-Drug Annotations

PharmGKB annotations follow a structured data model with three primary variant annotation files:

#### File 1: `var_pheno_ann.tsv` - Variant-Phenotype Associations
```
Fields:
- Variant Annotation ID     : Unique identifier
- Variant/Haplotypes         : dbSNP rsID or haplotype (e.g., CYP2D6*4)
- Gene                       : HGNC gene symbol
- Drug(s)                    : Drug name(s) involved
- PMID                       : Supporting publication PubMed ID
- Phenotype Category         : efficacy | toxicity | dosage | metabolism/PK | PD | other
- Significance               : yes | no | not stated
- Notes                      : Curator free-text notes
- Sentence                   : Structured annotation sentence
- Alleles                    : Basis for comparison
- Specialty Population       : e.g., pediatric
```

#### File 2: `var_drug_ann.tsv` - Variant-Drug Dose/Response Associations
```
Fields (subset):
- Variant Annotation ID
- Variant/Haplotypes
- Gene
- Drug(s)
- Multiple drugs And/or      : "and" (combination) | "or" (individual)
- PMID
- Phenotype Category
- Significance
- Notes
- Sentence
```

#### File 3: `var_fa_ann.tsv` - Functional Analysis Annotations
```
Fields:
- In vitro and functional analysis associations
- Similar structure to var_pheno_ann.tsv
- Focuses on mechanistic/functional data
```

#### Supporting File: `study_parameters.tsv`
```
Fields:
- Study population size
- Biogeographical group (ancestry)
- Statistical parameters (P-values, OR, CI)
- Cross-references to the 3 annotation files
```

### 2.5 Clinical Variants Data

The `clinicalVariants.zip` download contains a TSV file with all clinical variant-drug pairs and their evidence levels:

```
# Example entries (format):
# Variant         | Gene   | Drug          | Level | Phenotype Category
rs1065852         CYP2D6   Codeine         1A      efficacy
c.100C>T (rs3892097) CYP2D6 Paroxetine    1A      dosage
CYP2C19*2         CYP2C19  Clopidogrel     1A      efficacy
CYP2C19*2         CYP2C19  Citalopram      1A      dosage
CYP2C19*3         CYP2C19  Escitalopram    1A      dosage
HLA-B*15:02       HLA-B    Carbamazepine   1A      toxicity
rs4149056         SLCO1B1  Simvastatin     1A      toxicity
```

### 2.6 API and Data Access

#### REST API Endpoints (ClinPGx/PharmGKB API)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `GET /v1/data/gene/{symbol}` | GET | Gene information, VIP status, annotations | No |
| `GET /v1/data/drug/{name}` | GET | Drug annotations, CPIC guidelines | No |
| `GET /v1/data/variant/{rsId}` | GET | Variant-drug associations, clinical annotations | No |
| `GET /v1/data/clinicalAnnotation` | GET | All clinical annotations with levels | No |
| `GET /v1/data/guidelineAnnotation` | GET | CPIC/DPWG guideline annotations | No |
| `GET /v1/download/file/data/{file}` | GET | Bulk data downloads | No |
| `GET /v1/data/search` | GET | Search across genes, drugs, variants | No |

#### API Parameters

```
# Example: Query clinical annotations for CYP2D6
GET https://api.clinpgx.org/v1/data/clinicalAnnotation?gene=CYP2D6&level=1A

# Parameters:
- gene          : HGNC gene symbol (e.g., "CYP2D6")
- drug          : Drug name (e.g., "paroxetine")
- variant       : rsID or haplotype (e.g., "rs3892097")
- level         : Clinical annotation level (1A, 1B, 2A, 2B, 3, 4)
- phenotype     : Phenotype category (efficacy, toxicity, dosage)
- limit         : Result limit (default: 25, max: 1000)
- offset        : Pagination offset

# Response format: JSON with embedded clinical annotation objects
```

#### Bulk Downloads

| File | Size (approx) | Format | Update Frequency | Description |
|------|--------------|--------|-----------------|-------------|
| `summaryAnnotations.zip` | ~1.2 MB | TSV | Monthly | Summary annotations |
| `variantAnnotations.zip` | ~4.0 MB | TSV | Monthly | Full variant annotations (3 files) |
| `relationships.zip` | ~2.3 MB | TSV | Monthly | Gene-drug-variant relationships |
| `guidelineAnnotations.json.zip` | ~832 KB | JSON | Per CPIC update | CPIC/DPWG guideline data |
| `drugLabels.zip` | ~56 KB | TSV | Monthly | FDA drug label PGx annotations |
| `pathways-tsv.zip` | ~195 KB | TSV | Monthly | Pharmacokinetic/pathway data |
| `clinicalVariants.zip` | ~73 KB | TSV | Monthly | All clinical variant-drug pairs |

### 2.7 Licensing

**PharmGKB/ClinPGx data is licensed under CC BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0 International).**

Key requirements:
- Attribution to PharmGKB/ClinPGx and Stanford University required
- ShareAlike: Derivative works must be distributed under the same license
- Permits commercial use with proper attribution
- API data falls under this license
- Downloaded TSV/VCF files include LICENSE.txt

---

## 3. CPIC Guidelines Analysis

### 3.1 Overview

The Clinical Pharmacogenetics Implementation Consortium (CPIC) publishes peer-reviewed, evidence-based gene/drug clinical practice guidelines. CPIC guidelines are now hosted on ClinPGx (formerly on PharmGKB). Each guideline provides specific therapeutic recommendations based on genotype or phenotype.

### 3.2 Guideline Development Process

1. **Gene-Drug Pair Prioritization**: CPIC evaluates whether sufficient evidence exists for actionable recommendations
2. **Systematic Literature Review**: Comprehensive review of pharmacokinetic, pharmacodynamic, and clinical outcome studies
3. **Evidence Grading**: Recommendations classified as Strong, Moderate, Optional, or No Recommendation
4. **Peer Review**: Guidelines published in Clinical Pharmacology & Therapeutics
5. **Periodic Updates**: Guidelines reviewed and updated as new evidence emerges
6. **Implementation Resources**: CDS tables, EHR integration materials, phenotype translation tables

### 3.3 CPIC Evidence Classification

| Classification | Description | Example |
|----------------|-------------|---------|
| **Strong** | High-quality evidence supports the recommendation; benefits clearly outweigh risks | Avoid carbamazepine if HLA-B*15:02 positive |
| **Moderate** | Moderate evidence; most patients should follow the recommendation | 50% dose reduction of citalopram in CYP2C19 PMs |
| **Optional** | Some evidence; reasonable to consider but not required | Consider lower starting dose of paroxetine in CYP2D6 IMs |
| **No Recommendation** | Insufficient evidence to make a recommendation | No CYP2D6-based fluoxetine dosing recommendation |

### 3.4 CPIC Genes with Guidelines Relevant to Psychiatry/Neurology

#### 3.4.1 CYP2D6 - Serotonin Reuptake Inhibitor Antidepressants

**Guideline**: CPIC Guideline for CYP2D6, CYP2C19, CYP2B6, SLC6A4, and HTR2A Genotypes and Serotonin Reuptake Inhibitor Antidepressants (2023)

**CYP2D6 Phenotypes**: Ultrarapid Metabolizer (UM), Normal Metabolizer (NM), Intermediate Metabolizer (IM), Poor Metabolizer (PM), Indeterminate

| Drug | Phenotype | Recommendation | Classification |
|------|-----------|---------------|----------------|
| **Paroxetine** | UM | Select alternative drug not metabolized by CYP2D6 | Moderate |
| **Paroxetine** | NM | Initiate with recommended starting dose | Strong |
| **Paroxetine** | IM | Consider lower starting dose, slower titration | Optional |
| **Paroxetine** | PM | 50% dose reduction, slower titration, 50% lower maintenance dose | Moderate |
| **Fluvoxamine** | NM | Initiate with recommended starting dose | Strong |
| **Fluvoxamine** | IM | Initiate with recommended starting dose | Moderate |
| **Fluvoxamine** | PM | 25-50% lower starting dose, slower titration OR select alternative | Optional |
| **Venlafaxine** | UM | No action recommended (insufficient evidence) | No Recommendation |
| **Venlafaxine** | NM | Initiate with recommended starting dose | Strong |
| **Venlafaxine** | IM | No action recommended | No Recommendation |
| **Venlafaxine** | PM | Consider alternative drug not metabolized by CYP2D6 | Optional |
| **Vortioxetine** | UM | Select alternative OR increase maintenance dose by 50%+ | Optional |
| **Vortioxetine** | NM | Initiate with recommended starting dose | Strong |
| **Vortioxetine** | IM | Initiate with recommended starting dose | Moderate |
| **Vortioxetine** | PM | Initiate 50% of starting dose (5mg), max 10mg OR alternative | Moderate |
| **Fluoxetine** | All | **No recommendation** - total drug + metabolite concentrations may not vary significantly | CPIC Level C |
| **Duloxetine** | All | **No recommendation** - CYP2D6 impact not clinically meaningful | CPIC Level C |

**CPIC Activity Score to Phenotype Mapping**:
```
CYP2D6 Activity Score:
- AS = 0          : Poor Metabolizer (PM)
- AS = 0.5        : Intermediate Metabolizer (IM)
- AS = 1.0 - 2.0  : Normal Metabolizer (NM)
- AS > 2.0        : Ultrarapid Metabolizer (UM)

Key star alleles:
- *1, *2          : Normal function (activity score = 1.0 each)
- *3, *4, *5, *6  : No function (activity score = 0)
- *9, *10, *17, *29, *41 : Decreased function (activity score = 0.5)
- *1xN, *2xN     : Gene duplication (activity score = 2.0)
```

#### 3.4.2 CYP2C19 - SSRI Antidepressants

| Drug | Phenotype | Recommendation | Classification |
|------|-----------|---------------|----------------|
| **Citalopram** | UM/Rapid | Consider alternative; if used, may titrate higher | Strong/Optional |
| **Citalopram** | NM | Initiate with recommended starting dose | Strong |
| **Citalopram** | IM/Likely IM | Consider slower titration, lower maintenance dose | Moderate |
| **Citalopram** | PM/Likely PM | Consider alternative; if used, 50% maintenance dose reduction. **Max 20mg/day** (FDA warning for QT prolongation) | Strong |
| **Escitalopram** | UM | Consider alternative; if used, may titrate higher | Strong |
| **Escitalopram** | NM | Initiate with recommended starting dose | Strong |
| **Escitalopram** | IM | Consider slower titration, lower maintenance dose | Moderate |
| **Escitalopram** | PM | Consider alternative; if used, 50% maintenance dose reduction | Strong |
| **Sertraline** | UM/RM/NM | Initiate with recommended starting dose | Strong |
| **Sertraline** | IM | Slower titration, lower maintenance dose | Moderate |
| **Sertraline** | PM | Consider 50% maintenance dose reduction or alternative | Moderate |

**CYP2C19 Activity Score to Phenotype Mapping**:
```
CYP2C19 Activity Score:
- AS >= 2.5   : Ultrarapid Metabolizer (UM) - requires *17/*17
- AS = 1.5-2.0: Rapid Metabolizer (RM) - *1/*17 or *2/*17
- AS = 1.0    : Normal Metabolizer (NM)
- AS = 0.5    : Intermediate Metabolizer (IM)
- AS = 0      : Poor Metabolizer (PM)

Key star alleles:
- *1              : Normal function (AS = 1.0)
- *2 (rs4244285)  : No function (AS = 0)
- *3 (rs4986893)  : No function (AS = 0)
- *17 (rs12248560): Increased function (AS = 1.5)
```

#### 3.4.3 CYP2B6 - Sertraline

CPIC also provides CYP2B6-specific guidance for sertraline:

| Phenotype | Recommendation | Classification |
|-----------|---------------|----------------|
| UM/RM | Initiate with recommended starting dose | Moderate/Strong |
| NM | Initiate with recommended starting dose | Strong |
| IM | Consider slower titration, lower maintenance dose | Optional |
| PM | 25% reduction of standard maintenance dose OR alternative | Optional |

#### 3.4.4 CYP2D6 - Tricyclic Antidepressants (TCAs)

| Drug | Phenotype | Recommendation | Classification |
|------|-----------|---------------|----------------|
| **Amitriptyline** | UM | Avoid TCAs; consider alternative | Strong |
| **Amitriptyline** | NM | Initiate with standard dose | Strong |
| **Amitriptyline** | IM | 25% lower starting dose; consider TDM | Moderate |
| **Amitriptyline** | PM | Avoid OR 50% dose reduction; consider TDM | Strong |
| **Nortriptyline** | UM | Avoid TCAs; consider alternative | Strong |
| **Nortriptyline** | NM | Initiate with standard dose | Strong |
| **Nortriptyline** | IM | 50% lower starting dose; consider TDM | Moderate |
| **Nortriptyline** | PM | 50% dose reduction; consider TDM | Strong |

#### 3.4.5 HLA-B - Carbamazepine and Oxcarbazepine

**CPIC Guideline for HLA Genotype and Use of Carbamazepine and Oxcarbazepine (2017 Update)**

This guideline addresses two critical adverse drug reactions: Stevens-Johnson Syndrome (SJS) and Toxic Epidermal Necrolysis (TEN).

| Genotype | Drug | Risk | Recommendation | Classification |
|----------|------|------|---------------|----------------|
| **HLA-B*15:02 positive** | Carbamazepine | High SJS/TEN risk | **Do NOT use carbamazepine** if patient is carbamazepine-naive | Strong |
| **HLA-B*15:02 positive** | Oxcarbazepine | High SJS/TEN risk | **Do NOT use oxcarbazepine** if patient is oxcarbazepine-naive | Strong |
| **HLA-A*31:01 positive** | Carbamazepine | Increased SJS/TEN/DRESS/MPE risk | Consider alternative; if none available, use with increased monitoring | Strong/Optional |
| **Both negative** | Either | Normal risk | Use per standard guidelines | Strong |

**Key Clinical Notes**:
- Latency for SJS/TEN: typically 4-28 days with continuous dosing
- Cases usually occur within 3 months of therapy initiation
- Previous tolerance >3 months without reaction indicates extremely low future risk
- Positive predictive value of HLA-B*15:02 for carbamazepine-SJS: ~7.7% in Southeast Asians
- Negative predictive value approaches 100% in Southeast Asian populations

**FDA Label**: Carbamazepine carries a **boxed warning** for HLA-B*15:02 and SJS/TEN risk

#### 3.4.6 SLCO1B1 - Simvastatin-Induced Myopathy

| Genotype at rs4149056 | Phenotype | Myopathy Risk | Recommendation | Classification |
|----------------------|-----------|---------------|---------------|----------------|
| **TT** | Normal activity | Normal | Prescribe desired dose; FDA recommends against 80mg unless already tolerated 12+ months | Strong |
| **TC** | Intermediate activity | Intermediate (OR 4.5 per C allele at 80mg) | FDA recommends against 80mg; consider lower dose; if suboptimal efficacy, consider alternative statin | Strong |
| **CC** | Low activity | High (OR ~20.0 at 80mg) | FDA recommends against 80mg; prescribe lower dose OR consider alternative statin; consider routine CK surveillance | Strong |

**Key Evidence**: The SEARCH trial (N>12,000) demonstrated rs4149056 as the single variant most strongly associated with simvastatin-induced myopathy. The Heart Protection Study replicated this association (RR 2.6 per C allele at 40mg).

### 3.5 CPIC Guideline Access and Download Formats

CPIC guidelines are available via:
1. **ClinPGx website**: https://cpicpgx.org/guidelines (guideline summaries, gene-drug pairs)
2. **Full-text publications**: PubMed/PMC via Clinical Pharmacology & Therapeutics
3. **JSON download**: `guidelineAnnotations.json.zip` (via PharmGKB/ClinPGx downloads)
4. **Implementation resources**: EHR integration tables, phenotype translation tables, example CDS alerts

---

## 4. ClinVar Integration

### 4.1 Overview

ClinVar is NCBI's freely accessible database of human genetic variants and their relationships to phenotypes/diseases. It aggregates submissions from clinical laboratories, research groups, and expert panels. All ClinVar data is in the **public domain**.

### 4.2 Star Rating System (Review Status)

ClinVar uses a 4-star rating system to indicate the level of review supporting a variant classification:

| Stars | Review Status | Description | Clinical Confidence |
|-------|--------------|-------------|-------------------|
| **4** | Practice guideline | Classification from a professional medical genetics practice guideline (e.g., ACMG/AMP) | Highest |
| **3** | Reviewed by expert panel | Classification from a recognized expert panel (e.g., ClinGen) | Very high |
| **2** | Criteria provided, multiple submitters, no conflicts | Multiple submitters agree; assertion criteria provided | High |
| **1** | Criteria provided, conflicting classifications OR single submitter | Either multiple submitters disagree OR single submitter with criteria | Moderate |
| **0** | No assertion criteria provided | No supporting evidence or contact provided | Low |

### 4.3 Clinical Significance Categories

| Category | Description | PGx Relevance |
|----------|-------------|---------------|
| **Pathogenic** | Variant causes or strongly contributes to disease/toxicity | HLA-B*15:02 for carbamazepine-SJS |
| **Likely pathogenic** | High confidence but not definitive | Some DPYD loss-of-function variants |
| **Uncertain significance (VUS)** | Insufficient evidence for classification | Many rare CYP variants |
| **Likely benign** | High confidence of no clinical effect | Most common polymorphisms |
| **Benign** | No clinical significance | Synonymous variants in non-critical regions |
| **Conflicting interpretations** | Submitters disagree on classification | Requires manual review |
| **drug response** | Specifically annotated for drug response | CYP2D6*4, CYP2C19*2, etc. |
| **risk factor** | Modifies disease or drug response risk | CYP2D6*10, CYP2C19*17 |

### 4.4 NCBI E-Utilities API for ClinVar

#### API Specifications

| Parameter | Value |
|-----------|-------|
| **Base URL** | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` |
| **Database** | `clinvar` |
| **Rate limit (no API key)** | 3 requests/second |
| **Rate limit (with API key)** | 10 requests/second |
| **Max retrievals (no key)** | 10,000/day |
| **Authentication** | Optional API key via `api_key` parameter |
| **Output formats** | XML, JSON, VCF |
| **Licensing** | Public domain (U.S. government work) |

#### Key API Operations

```
# 1. Search for variants by gene (ESearch)
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=CYP2D6[Gene]&retmax=1000&retmode=json

# 2. Fetch detailed variant records (EFetch)
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=clinvar&id=VCV000012345&rettype=vcv&is_variationid&from_esearch=true

# 3. Get summary information (ESummary)
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=VCV000012345&retmode=json

# 4. Search for specific variant by rsID
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=rs3892097&retmode=json

# 5. Search for drug response variants
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=CYP2D6[Gene]+AND+drug+response[Clinical+Significance]&retmode=json
```

#### EFetch Response Structure (XML)

```xml
<!-- Example ClinVar VCV record -->
<ClinVarSet>
  <ReferenceClinVarAssertion>
    <ClinVarAccession Acc="VCV000012345" Version="1" Type="Variant" />
    <MeasureSet ID="12345" Type="Variant">
      <Measure Type="single nucleotide variant">
        <Name>
          <ElementValue Type="Preferred">CYP2D6*4 (rs3892097)</ElementValue>
        </Name>
        <AttributeSet>
          <Attribute Type="HGVS">NC_000022.11:g.42129011C>G</Attribute>
        </AttributeSet>
      </Measure>
    </MeasureSet>
    <ClinicalSignificance DateLastEvaluated="2024-01-15">
      <Description>drug response</Description>
      <ReviewStatus>practice guideline</ReviewStatus>  <!-- 4 stars -->
    </ClinicalSignificance>
    <TraitSet Type="Drug response">
      <Trait Type="Drug response">
        <Name>
          <ElementValue Type="Preferred">Codeine response - Toxicity/ADR</ElementValue>
        </Name>
      </Trait>
    </TraitSet>
  </ReferenceClinVarAssertion>
</ClinVarSet>
```

### 4.5 Bulk Download Options

| Format | Location | Size | Contents |
|--------|----------|------|----------|
| **Full XML** | `ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/` | Multi-GB compressed | Complete submission archive |
| **VCF (GRCh37/GRCh38)** | `ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh37/` / `vcf_GRCh38/` | ~1-2 GB | Variant sites with clinical significance |
| **Summary TSV** | `ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz` | ~500 MB | All variants with key fields |
| **Gene-condition TSV** | `ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/` | ~50 MB | Gene-phenotype relationships |

**Note**: Variants >10kb are excluded from VCF format. Large structural variants must be accessed via XML.

### 4.6 VUS (Variant of Uncertain Significance) Handling

#### Clinical Rules for VUS in PGx Context

1. **Never use VUS for clinical decision-making** - A VUS means there is insufficient evidence to classify the variant as pathogenic/benign
2. **Distinguish VUS from "no data"** - VUS has been reviewed but could not be classified; different from variants never submitted to ClinVar
3. **Consider phenoconversion** - A patient with a VUS in a critical pharmacogene should be treated as having indeterminate phenotype
4. **Flag for re-review** - ClinVar classifications are periodically updated; VUS may be reclassified
5. **Research-only display** - In the DeepSynaps interface, VUS should be clearly marked with a research flag

#### VUS Handling in DeepSynaps

```python
# Pseudocode for VUS handling
def classify_variant_significance(clinvar_record):
    if clinvar_record.clinical_significance == "drug response":
        return create_actionable_alert(clinvar_record)
    elif clinvar_record.clinical_significance == "pathogenic":
        return create_high_priority_alert(clinvar_record)
    elif clinvar_record.clinical_significance == "Uncertain significance":
        return {
            "display_mode": "RESEARCH_ONLY",
            "alert_level": "info",
            "message": f"Variant {clinvar_record.variant_id} has uncertain significance. "
                       "No clinical action recommended based on this variant alone.",
            "requires_review": True,
            "curation_date": clinvar_record.date_last_evaluated
        }
```

### 4.7 Psychiatric Pharmacogenomic Variants in ClinVar

| Variant (rsID) | Gene | HGVS | Clinical Significance | Review Status | Relevant Drug |
|----------------|------|------|----------------------|---------------|--------------|
| rs3892097 | CYP2D6 | c.1846G>A (*4) | drug response | practice guideline | Codeine, TCAs |
| rs1065852 | CYP2D6 | c.100C>T (*10) | drug response | expert panel | Multiple CYP2D6 substrates |
| rs5030655 | CYP2D6 | c.2545delA (*9) | drug response | expert panel | Multiple |
| rs35742686 | CYP2D6 | c.1707delT (*6) | drug response | expert panel | Multiple |
| rs5030656 | CYP2D6 | c.2615_2617delAAG (*3) | drug response | expert panel | Multiple |
| rs28371706 | CYP2D6 | c.2950G>C (*41) | drug response | criteria provided | Multiple |
| rs4244285 | CYP2C19 | c.681G>A (*2) | drug response | practice guideline | Clopidogrel, SSRIs |
| rs4986893 | CYP2C19 | c.636G>A (*3) | drug response | expert panel | Clopidogrel, SSRIs |
| rs12248560 | CYP2C19 | c.-806C>T (*17) | drug response | expert panel | Multiple |
| rs4149056 | SLCO1B1 | c.521T>C (*5) | drug response | expert panel | Simvastatin |
| rs776746 | CYP3A5 | c.6986A>G (*3) | drug response | expert panel | Tacrolimus |
| HLA-B*15:02 | HLA-B | N/A | pathogenic | practice guideline | Carbamazepine, oxcarbazepine |
| HLA-A*31:01 | HLA-A | N/A | risk factor | expert panel | Carbamazepine |

---

## 5. PharmCAT Pipeline

### 5.1 Overview

The Pharmacogenomics Clinical Annotation Tool (PharmCAT) is an open-source Java application developed by PharmGKB/ClinPGx that automates the translation of genotype data (VCF files) into phenotype-based clinical recommendations from CPIC and DPWG guidelines.

### 5.2 What PharmCAT Does

PharmCAT executes a 3-stage pipeline:

```
Stage 1: Named Allele Matcher
  Input:  Pre-processed VCF file
  Output: JSON file with matched named alleles (star alleles) and diplotypes

Stage 2: Phenotyper
  Input:  Named Allele Matcher JSON output + optional outside calls
  Output: Phenotype predictions (metabolizer status, activity scores)

Stage 3: Reporter
  Input:  Phenotyper output
  Output: HTML report + JSON report with CPIC/DPWG recommendations
```

### 5.3 CYP450 Calling Methodology

#### Supported Genes (non-CYP2D6)

PharmCAT performs exact matching of VCF variants against PharmVar-defined star allele definitions:

| Gene | Allele Definition Source | CNV Support | Notes |
|------|------------------------|-------------|-------|
| CYP2C19 | PharmVar | No | Full star allele calling |
| CYP2C9 | PharmVar | No | Full star allele calling |
| CYP2B6 | PharmVar | No | Full star allele calling |
| CYP3A5 | PharmVar | No | Full star allele calling |
| CYP3A4 | PharmVar | No | Full star allele calling |
| CYP1A2 | PharmVar | No | Full star allele calling |
| CYP4F2 | PharmVar | No | Full star allele calling |
| CYP2D6 | Limited (research mode) | **No** | Requires outside calls or research mode |
| G6PD | PharmVar | No | X-linked, handles hemizygosity |
| HLA-B | Requires outside calls | N/A | Requires external HLA typing |
| SLCO1B1 | PharmVar | No | Full star allele calling |
| TPMT | PharmVar | No | Full star allele calling |
| DPYD | PharmVar | No | Full star allele calling |
| UGT1A1 | PharmVar | No | Full star allele calling |
| VKORC1 | PharmVar | No | Full star allele calling |
| NAT2 | PharmVar | No | Full star allele calling |
| IFNL4 | PharmVar | No | Full star allele calling |
| NUDT15 | PharmVar | No | Full star allele calling |
| CFTR | PharmVar | No | Full star allele calling |
| RYR1 | PharmVar | No | Full star allele calling |
| CACNA1S | PharmVar | No | Full star allele calling |
| MT-RNR1 | Requires outside calls | N/A | Mitochondrial, requires outside call |

#### CYP2D6 Special Handling

CYP2D6 is the most challenging pharmacogene due to:
- **Gene deletions** (*5): VCF cannot represent whole gene deletion correctly
- **Gene duplications** (e.g., *1xN, *2xN): Required for UM phenotype detection; not representable in VCF
- **Structural variation**: Hybrid genes (e.g., *68+*4) not captured by SNP/indel

**Recommended Approach**: Use external tools like **StellarPGx** for CYP2D6 calling from CRAM/BAM files, then provide results as PharmCAT "outside calls."

```
# CYP2D6 outside call format (tab-delimited)
CYP2D6	*1/*4		
CYP2D6	*1/*2		2.0
```

#### Research Mode for CYP2D6

```bash
# PharmCAT CYP2D6 research mode (NOT for clinical use)
java -jar pharmcat.jar -vcf input.vcf -o output/ -research cyp2d6
```

**WARNING**: This mode uses only SNPs/indels from the VCF. It:
- Cannot detect gene duplications (will miss UMs)
- Cannot detect gene deletions (*5 calls will be inaccurate)
- Will misrepresent hemizygous variants as homozygous in *5 carriers
- Should NOT be used for clinical purposes

### 5.4 PharmCAT Output Format (JSON Report)

```json
{
  "source": {
    "name": "PharmCAT",
    "version": "2.13.0"
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "genes": {
    "CYP2D6": {
      "gene": "CYP2D6",
      "diplotype": "CYP2D6:*1/*4",
      "phenotype": "Poor Metabolizer",
      "activityScore": "0.0",
      "calledBy": {
        "matcher": true,
        "outsideCall": false
      }
    },
    "CYP2C19": {
      "gene": "CYP2C19",
      "diplotype": "CYP2C19:*1/*2",
      "phenotype": "Intermediate Metabolizer",
      "activityScore": "1.0",
      "calledBy": {
        "matcher": true,
        "outsideCall": false
      }
    }
  },
  "recommendations": [
    {
      "drug": "paroxetine",
      "drugGuideline": {
        "id": "PA166160506",
        "name": "CYP2D6 and SSRIs"
      },
      "guidelineSource": "CPIC",
      "recommendation": "Consider a 50% reduction in recommended starting dose, slower titration schedule, and a 50% lower maintenance dose as compared to normal metabolizers.",
      "classification": "Moderate",
      "implications": "Greatly reduced metabolism of paroxetine. Higher plasma concentrations may increase the probability of side effects.",
      "cpicClassification": "Moderate",
      "cpicDate": "2023-05-30"
    },
    {
      "drug": "citalopram",
      "drugGuideline": {
        "id": "PA166160506",
        "name": "CYP2C19 and SSRIs"
      },
      "guidelineSource": "CPIC",
      "recommendation": "Initiate therapy with recommended starting dose. Consider a slower titration schedule and lower maintenance dose than normal metabolizers.",
      "classification": "Moderate",
      "implications": "Reduced metabolism of citalopram compared to CYP2C19 normal metabolizers. Higher plasma concentrations may increase the probability of side effects."
    }
  ],
  "uncalledGenes": [],
  "warnings": []
}
```

### 5.5 Integration Approach for DeepSynaps

```
+--------------------------------------------------+
|          DeepSynaps PGx Integration Pipeline      |
+--------------------------------------------------+
|                                                   |
|  1. VCF Ingestion                                  |
|     - Patient VCF uploaded or referenced           |
|     - Preprocess with PharmCAT Preprocessor        |
|                                                   |
|  2. Outside Call Integration                       |
|     - CYP2D6 diplotype from StellarPGx             |
|     - HLA-B typing from external source            |
|     - MT-RNR1 if available                         |
|                                                   |
|  3. PharmCAT Named Allele Matcher                  |
|     Input:  Preprocessed VCF                       |
|     Output: Matched diplotypes JSON                |
|                                                   |
|  4. PharmCAT Phenotyper                            |
|     Input:  Diplotype JSON + Outside Calls         |
|     Output: Phenotype predictions JSON             |
|                                                   |
|  5. PharmCAT Reporter (CPIC mode)                  |
|     Input:  Phenotype JSON                         |
|     Output: HTML report + JSON report              |
|                                                   |
|  6. DeepSynaps Knowledge Enrichment                |
|     - Cross-reference PharmGKB clinical annotations|
|     - Overlay ClinVar variant significance         |
|     - Calculate composite confidence score         |
|     - Apply research-only flags                    |
|                                                   |
|  7. Clinical Decision Support Display              |
|     - Render prioritized alerts                    |
|     - Show evidence strength                       |
|     - Link to primary sources                      |
|     - Include "not a substitute for clinical       |
|       judgment" disclaimer                         |
|                                                   |
+--------------------------------------------------+
```

### 5.6 Open Source Status

- **License**: Apache License 2.0
- **Repository**: https://github.com/PharmGKB/PharmCAT
- **Language**: Java 11+
- **Current version**: 2.13.x (as of 2025)
- **Distribution**: Pre-built JAR releases on GitHub; also available via Docker
- **WDL pipeline**: Cromwell-compatible WDL for cloud execution

---

## 6. Psychiatric PGx Evidence

### 6.1 CYP2D6 Impact on Antidepressants

CYP2D6 is one of the most important pharmacogenes for psychiatric pharmacotherapy, metabolizing approximately 25% of all drugs and nearly all TCAs, many SSRIs/SNRIs, and most antipsychotics.

#### Population Frequencies (CYP2D6)

| Phenotype | European | African | East Asian | South Asian |
|-----------|----------|---------|------------|-------------|
| UM | 3-5% | 1-2% | 0.5-1% | 1-2% |
| NM | 70-80% | 60-70% | 50-60% | 60-70% |
| IM | 10-15% | 15-20% | 35-45% | 25-35% |
| PM | 5-10% | 1-3% | 0.5-1% | 1-3% |

#### Paroxetine + CYP2D6

| Phenotype | Clinical Effect | CPIC Action |
|-----------|----------------|-------------|
| UM | Undetectable/low plasma concentrations, reduced efficacy | **Avoid paroxetine** (Moderate) |
| NM | Normal metabolism and efficacy | Standard dosing (Strong) |
| IM | Slightly higher concentrations, increased side effect risk | Lower starting dose, slower titration (Optional) |
| PM | 5-10x higher AUC, markedly increased side effects | 50% dose reduction, 50% lower maintenance (Moderate) |

**Phenoconversion Warning**: Paroxetine is a potent CYP2D6 autoinhibitor. NM patients may phenoconvert to IM/PM phenotype with chronic dosing. This effect is dose-dependent and greater at steady state.

#### Venlafaxine + CYP2D6

| Phenotype | Clinical Effect | CPIC Action |
|-----------|----------------|-------------|
| UM | Increased O-desmethylvenlafaxine:venlafaxine ratio | No action recommended (insufficient outcome data) |
| NM | Normal metabolism | Standard dosing (Strong) |
| IM | Decreased O-desmethylvenlafaxine ratio | No action recommended |
| PM | Greatly decreased O-desmethylvenlafaxine ratio, increased side effects | Consider alternative (Optional) |

**Note**: Despite altered metabolite ratios, clinical impact is less clear for venlafaxine because both parent drug and active metabolite contribute to efficacy.

#### Vortioxetine + CYP2D6

| Phenotype | CPIC Action |
|-----------|-------------|
| UM | Select alternative OR increase maintenance by 50%+ (Optional) |
| NM | Standard dosing (Strong) |
| IM | Standard starting dose (Moderate) |
| PM | 50% starting dose (5mg), max 10mg OR alternative (Moderate) |

#### Fluoxetine + CYP2D6

**CPIC Level C (No Recommendation)**: Although CYP2D6 variants alter fluoxetine-to-norfluoxetine ratios, the sum total of fluoxetine + norfluoxetine concentrations may not vary significantly by CYP2D6 metabolizer status. Both fluoxetine and its active metabolite S-norfluoxetine have similar serotonin reuptake inhibition potency.

### 6.2 CYP2C19 Impact on SSRIs

CYP2C19 metabolizes citalopram, escitalopram, and (to a lesser extent) sertraline.

#### Citalopram + CYP2C19

| Phenotype | Clinical Effect | CPIC Action |
|-----------|----------------|-------------|
| UM (CYP2C19*17/*17) | Significantly lower exposure, reduced efficacy | Consider alternative (Strong) |
| RM (*1/*17) | Slightly lower exposure | Standard dose, consider titrating if inadequate response (Optional) |
| NM (*1/*1) | Normal metabolism | Standard dosing (Strong) |
| IM (*1/*2 or *1/*3) | Higher exposure | Standard start, slower titration, lower maintenance (Moderate) |
| PM (*2/*2, *2/*3, *3/*3) | Very high exposure, QT prolongation risk | Avoid OR 50% maintenance reduction. **Max 20mg/day** (Strong) |

**FDA Warning**: Citalopram 20mg/day is the maximum recommended dose in CYP2C19 PMs due to QT prolongation risk. This also applies to hepatic impairment, CYP2C19 inhibitor co-administration, and patients >60 years.

#### Escitalopram + CYP2C19

| Phenotype | CPIC Action |
|-----------|-------------|
| UM | Consider alternative (Strong) |
| RM | Standard start; titrate or switch if inadequate (Optional) |
| NM | Standard dosing (Strong) |
| IM | Slower titration, lower maintenance (Moderate) |
| PM | Avoid OR 50% maintenance reduction (Strong) |

#### Sertraline + CYP2C19/CYP2B6

Sertraline is unique because it is metabolized by both CYP2C19 and CYP2B6. CPIC provides:
- CYP2C19-specific recommendations (similar to citalopram)
- CYP2B6-specific recommendations
- **Combined CYP2C19/CYP2B6 recommendations** (Table 5 in CPIC guideline)

The combined phenotype table accounts for interactions between both genes:
- CYP2C19 PM + CYP2B6 PM: Select alternative antidepressant (Optional)
- CYP2C19 IM + CYP2B6 NM: Slower titration, lower maintenance (Moderate)
- CYP2C19 NM + CYP2B6 PM: 25% maintenance reduction (Optional)

### 6.3 CYP3A4/5 Impact on Antipsychotics

#### Aripiprazole

| Gene | Clinical Impact | Dosing Implication |
|------|----------------|-------------------|
| CYP2D6 PM | 50% increased AUC, 75h vs 146h half-life | 50% dose reduction (FDA recommendation) |
| CYP2D6 PM + CYP3A4 inhibitor | Additive effect | 75% dose reduction |
| CYP3A5 *1/*1 | Increased dizziness | Monitor |
| CYP2D6 IM/PM | Increased EPS in children | Reduced starting dose |

#### Risperidone

Risperidone is metabolized by CYP2D6 and CYP3A4/5 to 9-hydroxyrisperidone (active metabolite).

| Gene | Clinical Impact | Dosing Implication |
|------|----------------|-------------------|
| CYP2D6 PM | Decreased 9-OH-risperidone, increased parent drug | Consider dose reduction |
| CYP2D6 UM | Increased 9-OH-risperidone | Titrate to response |
| CYP3A4 *22 | Altered risperidone clearance | Monitor levels |
| ABCB1 (P-gp) variants | Altered brain penetration | May affect efficacy |

#### Clozapine and Olanzapine (CYP1A2 substrates)

| Gene/Factor | Clinical Impact |
|-------------|----------------|
| CYP1A2 *1F (fast metabolizer) | Lower clozapine/olanzapine levels |
| CYP1A2 *1C/*1K (slow metabolizer) | Higher levels, increased sedation |
| Smoking (CYP1A2 inducer) | 50-70% reduction in clozapine levels |
| Fluvoxamine (CYP1A2 inhibitor) | 5-10x increase in clozapine levels |

### 6.4 HLA-B*15:02 and Carbamazepine (SJS/TEN Risk)

This is one of the strongest pharmacogenomic associations in all of medicine.

| Parameter | Value |
|-----------|-------|
| **Odds ratio (SJS/TEN)** | >1000 in Han Chinese |
| **Carrier frequency** | 5-10% in Han Chinese, Thai; 1-2% in Indians; rare in Europeans/Africans |
| **Positive predictive value** | 7.7% for carbamazepine in Southeast Asians |
| **Negative predictive value** | ~100% |
| **Mortality (SJS)** | <5% |
| **Mortality (TEN)** | >30% |

**Clinical Implementation**:
- Screen patients of Asian ancestry before initiating carbamazepine
- If HLA-B*15:02 positive: Do NOT use carbamazepine or oxcarbazepine
- If HLA-B*15:02 negative: Can prescribe per standard guidelines
- If patient has previously tolerated carbamazepine >3 months: Extremely low future risk regardless of genotype

### 6.5 SLCO1B1 and Statins (Cognitive Considerations)

While statins are primarily used for cardiovascular disease, cognitive side effects ("statin brain fog") are relevant in psychiatric populations, especially those with pre-existing cognitive symptoms.

| rs4149056 Genotype | Simvastatin Risk | Recommendation |
|-------------------|-----------------|----------------|
| TT | Normal | Standard dosing (avoid 80mg) |
| TC | 4.5x increased myopathy risk (80mg) | Avoid 80mg; consider lower dose or alternative |
| CC | ~20x increased myopathy risk (80mg) | Lower dose or alternative statin; CK monitoring |

**Clinical Note**: SLCO1B1 variants affect systemic exposure of ALL statins, but the evidence is strongest for simvastatin. For patients requiring statin therapy where cognitive side effects are a concern, pravastatin or rosuvastatin may be preferred alternatives.

### 6.6 Evidence Quality Summary for Psychiatric PGx

| Gene-Drug Pair | CPIC Evidence | Clinical Actionability | Implementation Readiness |
|---------------|---------------|----------------------|-------------------------|
| CYP2D6 + Paroxetine | Strong | High | Ready |
| CYP2D6 + Vortioxetine | Strong | High | Ready |
| CYP2D6 + Fluvoxamine | Moderate | Moderate | Ready |
| CYP2D6 + Venlafaxine | Limited | Low | Research |
| CYP2D6 + Fluoxetine | None (Level C) | None | Not actionable |
| CYP2C19 + Citalopram | Strong | High | Ready |
| CYP2C19 + Escitalopram | Strong | High | Ready |
| CYP2C19 + Sertraline | Moderate | Moderate | Ready (with CYP2B6) |
| HLA-B*15:02 + Carbamazepine | Strong | Very High | Ready |
| SLCO1B1 + Simvastatin | Strong | High | Ready |
| CYP2D6 + Aripiprazole | Moderate | Moderate | Ready |
| CYP2D6 + Risperidone | Moderate | Moderate | Ready |
| CYP1A2 + Clozapine | Limited | Low | Research |
| CYP1A2 + Olanzapine | Limited | Low | Research |

---

## 7. DeepSynaps Integration Architecture

### 7.1 System Context

```
+------------------+     +------------------+     +------------------+
|   Patient Data   |     |  Knowledge Layer  |     |  Clinical Apps   |
|                  |     |                  |     |                  |
| - Demographics   | --> | - PharmGKB       | --> | - CDS Alerts     |
| - VCF/Genotype   |     | - CPIC           |     | - Risk Dashboard |
| - Medications    |     | - ClinVar        |     | - Provider View  |
| - Diagnoses      |     | - PharmCAT       |     | - Patient Report |
| - Lab Results    |     | - Confidence     |     | - Research Mode  |
+------------------+     +------------------+     +------------------+
                                ^
                                |
                         +------------------+
                         |  External APIs   |
                         |                  |
                         | - NCBI E-util.   |
                         | - ClinPGx API    |
                         | - PharmCAT       |
                         | - StellarPGx     |
                         +------------------+
```

### 7.2 Medication-Genetic Interaction Data Flow

```
Phase 1: Data Ingestion
  |
  |-- Patient VCF file uploaded via secure interface
  |-- CYP2D6 outside calls from StellarPGx (if WGS available)
  |-- HLA-B outside calls from clinical typing lab
  |-- Medication list from EHR or manual entry
  |
Phase 2: Phenotype Translation (PharmCAT)
  |
  |-- Run PharmCAT Preprocessor on VCF
  |-- Run Named Allele Matcher (all genes except CYP2D6/HLA-B)
  |-- Inject outside calls for CYP2D6, HLA-B, MT-RNR1
  |-- Run Phenotyper (genotype -> activity score -> phenotype)
  |
Phase 3: Guideline Lookup (CPIC)
  |
  |-- Query CPIC guideline database by (gene, phenotype, drug) triplets
  |-- Match patient phenotypes against active medications
  |-- Retrieve recommendation, classification, implications
  |
Phase 4: Knowledge Enrichment (PharmGKB + ClinVar)
  |
  |-- Cross-reference PharmGKB clinical annotations for additional evidence
  |-- Query ClinVar for variant significance and review status
  |-- Aggregate evidence from multiple sources
  |
Phase 5: Confidence Scoring
  |
  |-- Calculate composite confidence score per gene-drug pair
  |-- Apply evidence quality weights
  |-- Flag research-only associations
  |
Phase 6: CDS Display
  |
  |-- Generate prioritized alert list
  |-- Render evidence strength indicators
  |-- Include appropriate disclaimers
  |-- Log all recommendations for audit
```

### 7.3 Gene-Drug Interaction Normalization

```python
# DeepSynaps PGx Normalizer
class PgxInteractionNormalizer:
    """Normalizes gene-drug interactions across multiple sources."""
    
    GENE_SYMBOL_MAP = {
        "CYP2D6": {"hgnc_id": "HGNC:2625", "ncbi_gene_id": "1565"},
        "CYP2C19": {"hgnc_id": "HGNC:2621", "ncbi_gene_id": "1557"},
        "CYP2C9": {"hgnc_id": "HGNC:2623", "ncbi_gene_id": "1559"},
        "CYP3A4": {"hgnc_id": "HGNC:2637", "ncbi_gene_id": "1576"},
        "CYP3A5": {"hgnc_id": "HGNC:2638", "ncbi_gene_id": "1577"},
        "CYP1A2": {"hgnc_id": "HGNC:2617", "ncbi_gene_id": "1544"},
        "CYP2B6": {"hgnc_id": "HGNC:2615", "ncbi_gene_id": "1555"},
        "HLA-B": {"hgnc_id": "HGNC:4932", "ncbi_gene_id": "3106"},
        "SLCO1B1": {"hgnc_id": "HGNC:10959", "ncbi_gene_id": "10599"},
    }
    
    DRUG_RXCUI_MAP = {
        "paroxetine": {"rxcui": "32937", "atc": "N06AB05"},
        "citalopram": {"rxcui": "2556", "atc": "N06AB04"},
        "escitalopram": {"rxcui": "321988", "atc": "N06AB10"},
        "sertraline": {"rxcui": "36437", "atc": "N06AB06"},
        "fluoxetine": {"rxcui": "4493", "atc": "N06AB03"},
        "venlafaxine": {"rxcui": "39786", "atc": "N06AX16"},
        "vortioxetine": {"rxcui": "1356034", "atc": "N06AX26"},
        "fluvoxamine": {"rxcui": "42355", "atc": "N06AB08"},
        "aripiprazole": {"rxcui": "89013", "atc": "N05AX12"},
        "risperidone": {"rxcui": "35636", "atc": "N05AX08"},
        "carbamazepine": {"rxcui": "2002", "atc": "N03AF01"},
        "simvastatin": {"rxcui": "36567", "atc": "C10AA01"},
        "clozapine": {"rxcui": "2626", "atc": "N05AH02"},
        "olanzapine": {"rxcui": "61381", "atc": "N05AH03"},
    }
    
    def normalize_interaction(self, gene_symbol: str, drug_name: str) -> dict:
        """Returns normalized gene-drug pair with standard identifiers."""
        gene = self.GENE_SYMBOL_MAP.get(gene_symbol.upper())
        drug = self.DRUG_RXCUI_MAP.get(drug_name.lower())
        if not gene or not drug:
            return {"status": "UNKNOWN_PAIR", "requires_review": True}
        return {
            "gene_symbol": gene_symbol.upper(),
            "hgnc_id": gene["hgnc_id"],
            "drug_name": drug_name.lower(),
            "rxcui": drug["rxcui"],
            "atc_code": drug["atc"],
            "interaction_key": f"{gene_symbol.upper()}:{drug_name.lower()}",
            "status": "NORMALIZED"
        }
```

### 7.4 Phenotype Annotation Pipeline

```python
class PhenotypeAnnotationPipeline:
    """Translates genotype data to actionable phenotype annotations."""
    
    CYP2D6_PHENOTYPES = {
        (0.0, 0.0): "Poor Metabolizer",
        (0.5, 0.5): "Intermediate Metabolizer",
        (1.0, 1.0): "Normal Metabolizer",
        (1.0, 0.5): "Intermediate Metabolizer",
        (1.0, 0.0): "Intermediate Metabolizer",
        (2.0, 1.0): "Ultrarapid Metabolizer",
        (2.0, 2.0): "Ultrarapid Metabolizer",
        (None, None): "Indeterminate",
    }
    
    CYP2C19_PHENOTYPES = {
        (0.0, 0.0): "Poor Metabolizer",
        (0.5, 0.0): "Intermediate Metabolizer",
        (1.0, 0.0): "Intermediate Metabolizer",
        (1.0, 1.0): "Normal Metabolizer",
        (1.5, 1.0): "Rapid Metabolizer",
        (1.5, 1.5): "Ultrarapid Metabolizer",
        (2.0, 1.5): "Ultrarapid Metabolizer",
        (1.5, 0.0): "Intermediate Metabolizer",
        (None, None): "Indeterminate",
    }
    
    def annotate_phenotype(self, gene: str, diplotype: str, activity_score: float = None) -> dict:
        """
        Input: gene symbol, PharmCAT diplotype, optional activity score
        Output: standardized phenotype annotation with confidence
        """
        result = {
            "gene": gene,
            "diplotype": diplotype,
            "activity_score": activity_score,
            "phenotype": None,
            "confidence": None,
            "source": "PharmCAT",
            "called_by": "named_allele_matcher",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Phenotype lookup based on gene-specific logic
        if gene == "CYP2D6":
            result["phenotype"] = self._cyp2d6_phenotype(diplotype, activity_score)
        elif gene == "CYP2C19":
            result["phenotype"] = self._cyp2c19_phenotype(diplotype, activity_score)
        # ... etc for other genes
        
        # Confidence assignment
        if diplotype and "not called" not in diplotype.lower():
            result["confidence"] = "HIGH"
        elif "[*" in str(diplotype) and "research" in str(diplotype).lower():
            result["confidence"] = "LOW"
            result["research_only"] = True
        else:
            result["confidence"] = "NONE"
            result["phenotype"] = "Indeterminate"
        
        return result
```

### 7.5 Confidence Scoring for PGx Evidence

```python
class PgxConfidenceScorer:
    """Calculates composite confidence scores for gene-drug interactions."""
    
    # Evidence source weights
    SOURCE_WEIGHTS = {
        "CPIC_strong": 1.0,
        "CPIC_moderate": 0.8,
        "CPIC_optional": 0.5,
        "PharmGKB_1A": 0.9,
        "PharmGKB_1B": 0.7,
        "PharmGKB_2A": 0.5,
        "PharmGKB_2B": 0.3,
        "PharmGKB_3": 0.1,
        "ClinVar_4star": 0.9,
        "ClinVar_3star": 0.7,
        "ClinVar_2star": 0.5,
        "ClinVar_1star": 0.3,
        "ClinVar_0star": 0.0,
        "FDA_label": 0.85,
    }
    
    def calculate_confidence(self, gene_drug_pair: dict, sources: list) -> dict:
        """
        Calculates weighted confidence score across all evidence sources.
        Returns score 0.0-1.0 with tier classification.
        """
        weighted_sum = 0.0
        total_weight = 0.0
        
        for source in sources:
            weight = self.SOURCE_WEIGHTS.get(source["type"], 0.0)
            quality = source.get("quality_score", 1.0)
            weighted_sum += weight * quality
            total_weight += weight
        
        if total_weight > 0:
            composite_score = weighted_sum / total_weight
        else:
            composite_score = 0.0
        
        # Tier classification
        if composite_score >= 0.8:
            tier = "TIER_1"       # Actionable, high confidence
        elif composite_score >= 0.5:
            tier = "TIER_2"       # Actionable, moderate confidence
        elif composite_score >= 0.2:
            tier = "TIER_3"       # Consider, low confidence
        else:
            tier = "TIER_4"       # Research only / insufficient evidence
        
        return {
            "composite_score": round(composite_score, 3),
            "tier": tier,
            "actionable": composite_score >= 0.5,
            "research_only": composite_score < 0.3,
            "sources_considered": len(sources),
            "calculation_method": "weighted_average"
        }
```

### 7.6 Research-Only Flagging

| Condition | Flag | Display Rule |
|-----------|------|-------------|
| PharmGKB Level 3 or 4 | `RESEARCH_EVIDENCE` | Show in research mode only; info-level badge |
| CPIC Level C (No Recommendation) | `NOT_ACTIONABLE` | Do not show in clinical view; log for research |
| ClinVar 0-star assertion | `LOW_CONFIDENCE_VARIANT` | Show in research mode; warn about assertion quality |
| ClinVar VUS | `VARIANT_UNCERTAIN` | Never show as actionable; available for research review |
| PharmCAT research-mode CYP2D6 call | `RESEARCH_CALL` | Clearly mark as not for clinical use |
| Single study supporting association | `REPLICATION_NEEDED` | Show in research mode only |

### 7.7 Clinical Decision Support Display Rules

```
Alert Priority Levels:

CRITICAL (Red, immediate action required):
  - HLA-B*15:02 + Carbamazepine/Oxcarbazepine
  - CYP2D6 PM + Codeine (ultrarapid codeine metabolism for pain)
  - Any CPIC "Strong" recommendation requiring avoidance

HIGH (Orange, provider should review before prescribing):
  - CYP2C19 PM + Citalopram/Escitalopram (50% dose reduction)
  - CYP2D6 PM + Paroxetine/Vortioxetine (50% dose reduction)
  - CYP2D6 PM + Aripiprazole (50% dose reduction)
  - SLCO1B1 CC + High-dose simvastatin (myopathy risk)

MODERATE (Yellow, consider dose adjustment):
  - CYP2C19 IM + SSRIs (slower titration)
  - CYP2D6 IM + TCAs (lower starting dose)
  - CYP2B6 PM + Sertraline (25% reduction)
  - HLA-A*31:01 + Carbamazepine (monitoring)

INFO (Blue, informational):
  - CPIC "Optional" recommendations
  - PharmGKB Level 1B/2A annotations
  - Population frequency data for patient's ancestry
  - Research-only findings (in research mode)
```

---

## 8. Provenance & Confidence Model

### 8.1 Evidence Provenance Tracking

Every PGx recommendation in DeepSynaps must track its full provenance chain:

```json
{
  "recommendation_id": "rec-uuid-001",
  "patient_id": "anon-patient-id",
  "timestamp": "2025-01-15T10:30:00Z",
  "gene_drug_pair": {
    "gene": "CYP2D6",
    "drug": "paroxetine",
    "normalized_key": "CYP2D6:paroxetine"
  },
  "patient_phenotype": "Poor Metabolizer",
  "sources": [
    {
      "source_name": "CPIC",
      "source_version": "2023-05-30",
      "guideline_id": "PA166160506",
      "guideline_name": "CYP2D6 and Serotonin Reuptake Inhibitor Antidepressants",
      "recommendation_classification": "Moderate",
      "recommendation_text": "Consider a 50% reduction in recommended starting dose...",
      "confidence": 0.8,
      "evidence_quality": "high"
    },
    {
      "source_name": "PharmGKB",
      "source_version": "2025-01",
      "annotation_id": "1446610986",
      "annotation_level": "1A",
      "clinical_annotation_id": "1183076067",
      "confidence": 0.9,
      "evidence_quality": "high"
    },
    {
      "source_name": "ClinVar",
      "accession": "VCV000012345",
      "clinical_significance": "drug response",
      "review_status": "practice guideline",
      "star_rating": 4,
      "confidence": 0.9,
      "evidence_quality": "high"
    }
  ],
  "composite_score": 0.87,
  "tier": "TIER_1",
  "actionable": true,
  "research_only": false,
  "display_priority": "HIGH",
  "requires_acknowledgment": true,
  "data_retention_days": 2555
}
```

### 8.2 Confidence Model Weights

| Evidence Component | Weight | Rationale |
|-------------------|--------|-----------|
| CPIC Strong recommendation | 0.40 | Highest clinical authority |
| CPIC Moderate recommendation | 0.30 | Strong clinical evidence |
| CPIC Optional recommendation | 0.15 | Actionable but lower confidence |
| PharmGKB Level 1A | 0.10 | Corroborates CPIC |
| ClinVar 4-star assertion | 0.05 | Additional variant-level validation |
| Supporting literature count | 0.05 bonus per paper (max 0.20) | Replication increases confidence |

### 8.3 Data Freshness Requirements

| Data Type | Maximum Age | Refresh Strategy |
|-----------|------------|-----------------|
| CPIC guidelines | 1 year | Check CPIC website monthly; auto-update on new release |
| PharmGKB annotations | 6 months | Monthly bulk download; diff-based update |
| ClinVar variants | 3 months | Quarterly VCF re-download |
| Star allele definitions (PharmVar) | 6 months | Semi-annual update |
| PharmCAT version | Latest stable | Update within 30 days of new release |

---

## 9. Licensing Matrix

| Resource | License | Commercial Use | Attribution Required | ShareAlike | Notes |
|----------|---------|---------------|---------------------|------------|-------|
| **PharmGKB/ClinPGx** | CC BY-SA 4.0 | Yes | Yes | Yes | Include ClinPGx attribution in all displays |
| **CPIC Guidelines** | CC BY 4.0 | Yes | Yes | No | Guidelines are public domain when published |
| **ClinVar (NCBI)** | Public Domain (US Gov) | Yes | Recommended | No | Freely redistribute |
| **PharmCAT** | Apache 2.0 | Yes | Yes | No | Open source, can modify |
| **PharmVar** | Free for non-commercial | Restricted | Yes | N/A | Commercial licensing may be required |
| **dbSNP** | Public Domain | Yes | No | No | NCBI resource |
| **StellarPGx** | GPL/Academic | Restricted | Yes | Yes | Academic use only; commercial license needed |
| **FDA Drug Labels** | Public Domain | Yes | No | No | U.S. government content |

### 9.1 Compliance Requirements

1. **All PGx displays must include**: "Pharmacogenomic data curated by ClinPGx (formerly PharmGKB), Stanford University. Available at https://www.clinpgx.org under CC BY-SA 4.0."

2. **CPIC recommendations must include**: "CPIC guideline reference: [citation]. Available at https://cpicpgx.org"

3. **ClinVar data must include**: "ClinVar data from NCBI. Public domain."

4. **PharmCAT-derived reports must include**: "Generated using PharmCAT [version]. Available at https://pharmcat.org"

---

## 10. Implementation Recommendations

### 10.1 Phase 1 Implementation (Immediate - 0-3 months)

1. **Deploy PharmCAT pipeline** in Docker container
2. **Implement VCF preprocessing** with GRCh37/GRCh38 liftover support
3. **Integrate CYP2D6 outside call input** from StellarPGx or clinical lab reports
4. **Build CPIC guideline lookup service** using JSON download
5. **Implement phenotype-to-recommendation mapper** for priority gene-drug pairs:
   - CYP2D6 x Paroxetine, Vortioxetine, Fluvoxamine
   - CYP2C19 x Citalopram, Escitalopram, Sertraline
   - HLA-B x Carbamazepine, Oxcarbazepine
   - SLCO1B1 x Simvastatin
6. **Build basic CDS alert renderer** with priority levels

### 10.2 Phase 2 Implementation (3-6 months)

1. **Integrate PharmGKB clinical annotations** via API or bulk download
2. **Add ClinVar variant cross-reference** using E-utilities API
3. **Implement confidence scoring engine**
4. **Build research-only mode toggle**
5. **Add population frequency display** (by ancestry)
6. **Implement audit logging** for all recommendations
7. **Add HLA-B outside call support** for clinical typing results

### 10.3 Phase 3 Implementation (6-12 months)

1. **Full ClinVar integration** with star rating overlay
2. **Multi-gene combined phenotype support** (e.g., CYP2C19 + CYP2B6 for sertraline)
3. **Phenoconversion detection** (CYP2D6 autoinhibition by paroxetine/fluoxetine)
4. **Drug-drug interaction overlay** (CYP inhibitors/inducers affecting phenotype)
5. **Patient-facing report generation**
6. **Outcome tracking** for PGx-guided prescribing

### 10.4 Technology Stack Recommendations

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| PharmCAT execution | Docker container + Java 11 | Official distribution method |
| VCF preprocessing | bcftools + custom Python | Industry standard |
| CYP2D6 calling | StellarPGx (external) | Best-in-class structural variant calling |
| Data store | PostgreSQL + JSONB | Flexible schema for evolving annotations |
| API layer | Python FastAPI | Async support, OpenAPI docs |
| Caching | Redis | Fast guideline lookups |
| Background jobs | Celery + Redis | Async PharmCAT execution |
| Frontend | React/Vue | Component-based CDS display |

---

## 11. Clinical Safety Rules

### 11.1 Mandatory Safety Rules

**Rule 1: Never Override Provider Judgment**
- All PGx recommendations are advisory only
- Must display: "This pharmacogenomic analysis is intended as a decision support tool and does not replace clinical judgment."

**Rule 2: Research-Only Flag Enforcement**
- Level 3/4 PharmGKB annotations must NEVER trigger clinical alerts
- PharmCAT research-mode CYP2D6 calls must be clearly labeled as non-clinical
- VUS variants must never drive dosing recommendations

**Rule 3: Phenoconversion Warnings**
- When CYP2D6 NM/IM patient is prescribed paroxetine or fluoxetine, display phenoconversion warning
- Recommend considering patient as functionally lower metabolizer with chronic dosing

**Rule 4: Multi-Gene Interaction Awareness**
- For sertraline: Always consider both CYP2C19 AND CYP2B6 status
- For drugs metabolized by multiple pathways: Note limitation of single-gene testing

**Rule 5: Ethnicity-Awareness for HLA-B**
- HLA-B*15:02 screening primarily relevant for patients of Asian ancestry
- Do NOT flag as universally required screening
- Include population-specific carrier frequency data

**Rule 6: Drug-Drug Interaction Overlay**
- PGx phenotype may be overridden by drug-drug interactions
- CYP2D6 PM + fluoxetine co-administration: patient functionally becomes PM regardless of genotype
- Always evaluate concomitant CYP inhibitors/inducers

**Rule 7: Incomplete Data Handling**
- Indeterminate phenotype: No recommendation should be displayed
- Missing VCF positions: Must not be assumed reference
- Partial gene coverage: Must flag as incomplete analysis

### 11.2 Alert Suppression Rules

Alerts MAY be suppressed (with documentation) when:
1. Patient has tolerated the medication at therapeutic dose for >90 days
2. Therapeutic drug monitoring confirms appropriate levels
3. Provider documents clinical decision to override with rationale
4. Patient is in end-of-life care where medication optimization is not the primary goal

### 11.3 Required Disclaimers

**Every PGx display must include:**

> "This pharmacogenomic analysis is based on CPIC guidelines, PharmGKB/ClinPGx clinical annotations, and ClinVar variant classifications. Gene-drug interactions are one of many factors that influence medication response. This analysis does not replace clinical judgment, therapeutic drug monitoring, or comprehensive medication review. Pharmacogenomic testing has limitations including incomplete gene coverage, variant interpretation uncertainty, and the influence of drug-drug interactions, diet, and environmental factors."

---

## 12. Risks & Mitigations

### 12.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Incorrect CYP2D6 phenotype** (due to structural variant miss) | High (if VCF-only) | Critical | Always use outside calls from StellarPGx or clinical lab for CYP2D6 |
| **VCF normalization errors** | Medium | High | Use bcftools norm; validate against reference genome |
| **Outdated CPIC guidelines** | Low | High | Monthly guideline version check; auto-alert on updates |
| **ClinVar conflicting interpretations** | Medium | Medium | Display star rating; flag conflicts for review |
| **Population ancestry mismatch** | Medium | Medium | Include ancestry-specific frequency data; note limitations |
| **PharmCAT execution failure** | Low | High | Implement fallback manual phenotype entry; validate all outputs |
| **Data privacy breach** | Low | Critical | De-identify all data; encrypt in transit and at rest; audit all access |
| **Over-reliance on single-gene testing** | Medium | Medium | Display multi-gene considerations; flag when additional testing may be warranted |
| **Phenoconversion not detected** | Medium | High | Flag when autoinhibitors/inducers are co-prescribed |
| **Regulatory non-compliance** (FDA) | Low | Critical | Label as research/decision support; not diagnostic; include all required disclaimers |
| **License violation** | Low | Medium | Implement automated attribution in all displays; review licenses quarterly |
| **API rate limiting** (NCBI) | Medium | Low | Implement caching; use API key; batch requests |

### 12.2 Specific Risk: CYP2D6 Structural Variants

**Risk**: CYP2D6 has complex structural variation (gene deletions, duplications, hybrid genes) that cannot be captured by VCF files. PharmCAT VCF-based CYP2D6 calling is explicitly marked as research-only.

**Mitigation**:
1. Require outside CYP2D6 calls from clinical-grade testing or StellarPGx
2. If no outside calls available, flag CYP2D6 as "Indeterminate - structural variant analysis required"
3. Never display VCF-based CYP2D6 phenotype as definitive clinical result
4. Consider CYP2D6 as a "mandatory outside call" gene in the pipeline

### 12.3 Specific Risk: Incomplete Gene Coverage

**Risk**: A VCF may not include all positions required for PharmCAT allele calling, leading to incorrect diplotypes.

**Mitigation**:
1. Run PharmCAT Preprocessor to check coverage at all required positions
2. Report coverage percentage per gene
3. If coverage <95% for a pharmacogene, flag as "insufficient coverage"
4. Do not report phenotype for genes with insufficient coverage

### 12.4 Specific Risk: Regulatory Classification

**Risk**: The FDA classifies pharmacogenomic clinical decision support as a potential medical device depending on functionality.

**Mitigation**:
1. Design system as "clinical decision support" (informational only)
2. Do not automate prescribing decisions
3. Require provider acknowledgment of all alerts
4. Include comprehensive disclaimers
5. Consult with regulatory affairs on 21 CFR 892 classification
6. Monitor FDA guidance on PGx software devices

---

## Appendix A: CPIC Gene-Drug Pairs for Psychiatry/Neurology

| Priority | Gene | Drug | CPIC Status | Actionability |
|----------|------|------|-------------|---------------|
| 1 | CYP2D6 | Paroxetine | Published (2023) | HIGH |
| 1 | CYP2D6 | Vortioxetine | Published (2023) | HIGH |
| 1 | CYP2D6 | Amitriptyline | Published | HIGH |
| 1 | CYP2D6 | Nortriptyline | Published | HIGH |
| 1 | CYP2C19 | Citalopram | Published (2023) | HIGH |
| 1 | CYP2C19 | Escitalopram | Published (2023) | HIGH |
| 1 | HLA-B | Carbamazepine | Published (2017) | VERY HIGH |
| 2 | CYP2C19 | Sertraline | Published (2023) | MODERATE |
| 2 | CYP2B6 | Sertraline | Published (2023) | MODERATE |
| 2 | CYP2D6 | Fluvoxamine | Published (2023) | MODERATE |
| 2 | CYP2D6 | Venlafaxine | Published (2023) | LOW |
| 2 | CYP2D6 | Aripiprazole | In Progress | MODERATE |
| 2 | CYP2D6 | Risperidone | In Progress | MODERATE |
| 3 | SLCO1B1 | Simvastatin | Published | HIGH |
| 3 | CYP3A5 | Tacrolimus | Published | LOW (for psych) |
| 3 | CYP2D6 | Atomoxetine | Published | MODERATE |
| 3 | CYP2D6 | Codeine | Published | HIGH |
| 4 | CYP2C19 | Clopidogrel | Published | N/A (cardiology) |
| 4 | CYP2C9 | Warfarin | Published | N/A (cardiology) |

## Appendix B: Key Variant Reference Table

| Variant | Gene | HGVS | Consequence | Star Allele | Clinical Impact |
|---------|------|------|-------------|-------------|----------------|
| rs3892097 | CYP2D6 | c.1846G>A | Splicing defect | *4 | No function |
| rs1065852 | CYP2D6 | c.100C>T | P34S | *10 | Decreased function |
| rs5030655 | CYP2D6 | c.2545delA | Frameshift | *9 | No function |
| rs28371706 | CYP2D6 | c.2950G>C | V486V | *41 | Decreased function |
| rs4244285 | CYP2C19 | c.681G>A | Splicing defect | *2 | No function |
| rs4986893 | CYP2C19 | c.636G>A | W212* | *3 | No function |
| rs12248560 | CYP2C19 | c.-806C>T | Promoter | *17 | Increased function |
| rs4149056 | SLCO1B1 | c.521T>C | V174A | *5 | Decreased function |
| rs776746 | CYP3A5 | c.6986A>G | Splicing | *3 | No function (non-expressor) |
| HLA-B*15:02 | HLA-B | N/A | N/A | N/A | Carbamazepine hypersensitivity |
| HLA-A*31:01 | HLA-A | N/A | N/A | N/A | Carbamazepine DRESS/SJS |

## Appendix C: ClinVar E-utilities Example Queries

```python
# Python example using Biopython for ClinVar queries
from Bio import Entrez

Entrez.email = "api@deepsynaps.org"
Entrez.api_key = "YOUR_NCBI_API_KEY"  # Increases rate limit to 10/sec

def search_clinvar_by_gene(gene_symbol, clinical_significance="drug response"):
    """Search ClinVar for pharmacogenomic variants in a gene."""
    query = f"{gene_symbol}[Gene] AND {clinical_significance}[Clinical Significance]"
    handle = Entrez.esearch(db="clinvar", term=query, retmax=1000, retmode="json")
    results = json.load(handle)
    handle.close()
    return results["esearchresult"]["idlist"]

def fetch_clinvar_variant(variation_id):
    """Fetch detailed ClinVar record for a variant."""
    handle = Entrez.efetch(db="clinvar", id=variation_id, rettype="vcv", retmode="xml")
    record = handle.read()
    handle.close()
    return record

def get_variant_summary(variation_ids):
    """Get summary information for multiple variants."""
    handle = Entrez.esummary(db="clinvar", id=",".join(variation_ids), retmode="json")
    results = json.load(handle)
    handle.close()
    return results

# Example usage
variation_ids = search_clinvar_by_gene("CYP2D6")
print(f"Found {len(variation_ids)} CYP2D6 drug response variants in ClinVar")
```

## Appendix D: Data Freshness and Version Tracking

```json
{
  "data_versions": {
    "pharmgkb_clinpgx": {
      "version": "2025-01-15",
      "download_url": "https://api.clinpgx.org/v1/download/",
      "last_updated": "2025-01-15T00:00:00Z",
      "next_check": "2025-02-15T00:00:00Z"
    },
    "cpic_guidelines": {
      "ssri_guideline_version": "2023-05-30",
      "carbamazepine_guideline_version": "2017-12-01",
      "statins_guideline_version": "2022-03-01",
      "last_check": "2025-01-15T00:00:00Z"
    },
    "clinvar": {
      "vcf_release_date": "2025-01-06",
      "ftp_url": "ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/",
      "last_updated": "2025-01-15T00:00:00Z"
    },
    "pharmvar": {
      "version": "6.2",
      "star_allele_release": "2024-12-01",
      "last_updated": "2025-01-15T00:00:00Z"
    },
    "pharmcat": {
      "version": "2.13.0",
      "release_date": "2024-12-15",
      "last_updated": "2025-01-15T00:00:00Z"
    }
  }
}
```

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-07-29 | DeepSynaps Research | Initial comprehensive integration report |

**References**

1. Clinical Pharmacogenetics Implementation Consortium (CPIC). Guidelines for CYP2D6, CYP2C19, CYP2B6, SLC6A4, and HTR2A Genotypes and Serotonin Reuptake Inhibitor Antidepressants. *Clin Pharmacol Ther*. 2023;114(1):51-68.
2. CPIC Guideline for HLA Genotype and Use of Carbamazepine and Oxcarbazepine. *Clin Pharmacol Ther*. 2018;103(4):574-581.
3. CPIC Guideline for SLCO1B1 and Simvastatin-Induced Myopathy. *Clin Pharmacol Ther*. 2014;96(4):423-428.
4. Karamperis K et al. How to Run the Pharmacogenomics Clinical Annotation Tool (PharmCAT). *Clin Pharmacol Ther*. 2023;113(5):1036-1047.
5. Mosley SA et al. An Evidence-Based Framework for Evaluating Pharmacogenomics Knowledge for Personalized Medicine. *Clin Pharmacol Ther*. 2021;110(5):1236-1250.
6. PharmGKB. Very Important Pharmacogene summaries. https://www.pharmgkb.org/vip
7. NCBI ClinVar. https://www.ncbi.nlm.nih.gov/clinvar
8. ClinVar Review Status Guidelines. https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/
9. NCBI E-utilities Documentation. https://www.ncbi.nlm.nih.gov/books/NBK25501/
10. FDA Table of Pharmacogenetic Associations. https://www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations

---

*End of Report*
