# Open Pharmacogenomics Data Stack: Comprehensive Research Report

**DeepSynaps Protocol Studio | Research Division**

**Document Version:** 1.0.0
**Last Updated:** 2026-07-10
**Classification:** Open-Source Research | Clinician-Facing
**Target Audience:** Bioinformatics Engineers, Clinical Pharmacists, PGx Implementers

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [PharmGKB / ClinPGx](#2-pharmgkb--clinpgx)
3. [CPIC Guidelines](#3-cpic-guidelines)
4. [ClinVar](#4-clinvar)
5. [PharmVar](#5-pharmvar)
6. [FDA Pharmacogenomic Biomarkers](#6-fda-pharmacogenomic-biomarkers)
7. [openFDA](#7-openfda)
8. [RxNorm / RxNav](#8-rxnorm--rxnav)
9. [DailyMed](#9-dailymed)
10. [GWAS Catalog](#10-gwas-catalog)
11. [dbSNP](#11-dbsnp)
12. [1000 Genomes](#12-1000-genomes)
13. [PharmGKB API Code Examples](#13-pharmgkb-api-code-examples)
14. [CPIC Guidelines Parser](#14-cpic-guidelines-parser)
15. [FDA Labels Parser](#15-fda-labels-parser)
16. [VCF Parsing for PGx](#16-vcf-parsing-for-pgx)
17. [Integration Architecture](#17-integration-architecture)
18. [Appendix: Evidence Grading](#18-appendix-evidence-grading)
19. [Appendix: CYP450 Reference Table](#19-appendix-cyp450-reference-table)
20. [Appendix: Psychiatric Medication PGx Genes](#20-appendix-psychiatric-medication-pgx-genes)
21. [Appendix: License Compatibility Matrix](#21-appendix-license-compatibility-matrix)

---

## 1. Executive Summary

### 1.1 Purpose

This report catalogs all legally usable, open-access pharmacogenomics (PGx) datasets, APIs, and knowledge bases available for integration into clinical decision support systems. The resources are prioritized for psychiatric and neurological medication pharmacogenomics but cover all therapeutic areas.

### 1.2 Key Findings

| Resource | License | Authentication | PGx Specific | Update Frequency |
|----------|---------|---------------|-------------|-----------------|
| ClinPGx (PharmGKB + CPIC) | CC BY-SA 4.0 | Not required | Yes | Monthly |
| PharmVar | Free (API key) | API key required | Yes | Quarterly |
| ClinVar | Public Domain | Not required | Partial | Monthly |
| FDA Biomarkers Table | Public Domain | Not required | Yes | Quarterly |
| openFDA | CC0 / Open Data | API key recommended | Yes | Weekly |
| RxNorm/RxNav | UMLS License | UMLS account | No | Weekly |
| DailyMed | Public Domain | Not required | Yes | Daily |
| GWAS Catalog | CC0 | Not required | No | Biweekly |
| dbSNP | Public Domain | Not required | No | Quarterly |
| 1000 Genomes | Open Access | Not required | No | Static (Phase 3) |

### 1.3 Critical Update: ClinPGx Merger (2024-2025)

**Important:** As of 2024-2025, PharmGKB and CPIC have been consolidated under the **ClinPGx** umbrella organization (https://www.clinpgx.org). The PharmGKB API endpoint has migrated from `api.pharmgkb.org` to `api.clinpgx.org/v1/`. All CPIC guidelines are now hosted at `https://www.clinpgx.org/cpic/guidelines`.

This report uses the current ClinPGx endpoints while referencing legacy PharmGKB naming for clarity.

---

## 2. PharmGKB / ClinPGx

### 2.1 Overview

**Name:** Pharmacogenomics Knowledgebase (PharmGKB) / Clinical Pharmacogenomics (ClinPGx)
**Primary URL:** https://www.clinpgx.org
**API Base URL:** https://api.clinpgx.org/v1
**Former URL:** https://www.pharmgkb.org (redirects to ClinPGx)
**Primary Institution:** Stanford University, St. Jude Children's Research Hospital
**Funding:** NIH/NHGRI (U24HG010615, U24HG013077)
**First Released:** 2001 (PharmGKB), 2024 (ClinPGx merger)

### 2.2 Description

ClinPGx (formerly PharmGKB) is the world's premier pharmacogenomics knowledge base, providing curated information about how genetic variation affects drug response. It is a NIH-funded Global Core Biodata Resource that integrates:

- **Clinical Annotations:** Evidence-based summaries of gene-drug-variant associations with levels of evidence (1A-4)
- **Drug Labels:** FDA-approved pharmacogenomic drug labels from global regulatory agencies
- **Clinical Guidelines:** CPIC, DPWG, CPNDS, and RNPGx dosing guidelines
- **Pathways:** Pharmacokinetic and pharmacodynamic drug pathways (BioPAX format)
- **Variant Annotations:** Literature-based evidence for individual gene-drug-variant findings
- **Very Important Pharmacogenes (VIP):** Curated gene summaries with special focus on clinically relevant pharmacogenes

### 2.3 License

**License:** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)
**Commercial Use:** Allowed with attribution
**Attribution Required:** Yes
**ShareAlike Required:** Yes (derivatives must use same license)
**Citation:** Cite the ClinPGx/PharmGKB publication: PMID references available at https://www.clinpgx.org/publications

**Full Data Usage Policy:** https://www.clinpgx.org/page/dataUsagePolicy

### 2.4 Data Access Methods

#### 2.4.1 REST API

The ClinPGx API is a RESTful JSON interface serving all curated data.

| Feature | Details |
|---------|---------|
| Base URL | `https://api.clinpgx.org/v1` |
| Authentication | None required for most endpoints |
| Rate Limit | 2 requests per second |
| Format | JSON |
| Documentation | Swagger/OpenAPI available at api.clinpgx.org |

**Key Endpoints:**

| Endpoint | Description | Example |
|----------|-------------|---------|
| `/data/clinicalAnnotation` | Clinical annotations by ID | `GET /data/clinicalAnnotation/{id}?view=base` |
| `/data/clinicalAnnotation` | List clinical annotations | `GET /data/clinicalAnnotation?relatedGenes.id={PA_id}` |
| `/data/gene` | Gene search/details | `GET /data/gene?symbol=CYP2D6&view=min` |
| `/data/chemical` | Drug search/details | `GET /data/chemical?name=warfarin` |
| `/data/variant` | Variant search/details | `GET /data/variant?location=22:42522012` |
| `/data/guideline` | CPIC dosing guidelines | `GET /data/guideline/{id}?view=base` |
| `/data/pathway` | Drug pathways | `GET /data/pathway/{id}` |

**Endpoint Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `view` | string | Data detail level: `min`, `base`, `max` |
| `symbol` | string | Gene symbol (e.g., CYP2D6) |
| `name` | string | Entity name (e.g., warfarin) |
| `relatedGenes.id` | string | PharmGKB PA accession ID |
| `location` | string | Chromosomal position |

**Important API Limitations:**
- The API does NOT support filtering clinical annotations by gene symbol directly (returns HTTP 400)
- Gene symbol must first be resolved to a PharmGKB PA ID via `/data/gene` endpoint
- Direct annotation listing by gene requires browsing the website: `https://www.clinpgx.org/gene/{PA_id}/clinicalAnnotation`

#### 2.4.2 Bulk Data Downloads

| File | URL | Size (Approx) | Format | Description |
|------|-----|--------------|--------|-------------|
| Summary Annotations | `/download/file/data/summaryAnnotations.zip` | 1.2 MB | TSV | Summary-level annotations |
| Variant Annotations | `/download/file/data/variantAnnotations.zip` | 4.0 MB | TSV | Variant-level evidence |
| Relationships | `/download/file/data/relationships.zip` | 2.3 MB | TSV | Gene-drug-variant relationships |
| Guideline Annotations (JSON) | `/download/file/data/guidelineAnnotations.json.zip` | 832 KB | JSON | CPIC/DPWG guideline details |
| Drug Labels | `/download/file/data/drugLabels.zip` | 56 KB | TSV | FDA/EMA PGx drug labels |
| Pathways (BioPAX) | `/download/file/data/pathways-biopax.zip` | 619 KB | BioPAX XML | Drug pathways |
| Pathways (TSV) | `/download/file/data/pathways-tsv.zip` | 194 KB | TSV | Pathway data in TSV |
| Clinical Variants | `/download/file/data/clinicalVariants.zip` | 72 KB | TSV | Variant-drug pairs with evidence levels |
| Genes | `/download/file/data/genes.zip` | 2.8 MB | TSV | Gene reference data |
| Variants | `/download/file/data/variants.zip` | 869 KB | TSV | Variant reference data |

**Full download URL format:** `https://api.clinpgx.org/v1/download/file/data/{filename}`

#### 2.4.3 Clinical Annotation Levels of Evidence

| Level | Definition | Clinical Actionability |
|-------|-----------|---------------------|
| **1A** | Variant-drug combination in CPIC/medical society-endorsed guideline, or implemented at major health system | **Highest** - Guideline-based prescribing |
| **1B** | Preponderance of evidence shows association; replicated in multiple cohorts with significant p-values | **High** - Strong evidence for clinical use |
| **2A** | Qualifies for 2B; variant in VIP gene (Very Important Pharmacogene) | **Moderate-High** - Known pharmacogene |
| **2B** | Moderate evidence; replicated but some non-significant studies or small effect size | **Moderate** - Consider in clinical context |
| **3** | Single significant study (not replicated) or conflicting evidence | **Low** - Research-grade only |
| **4** | Case report, non-significant study, or in vitro/molecular evidence | **Very Low** - Not clinically actionable |

### 2.5 Data Model

#### 2.5.1 Clinical Annotation JSON Structure (v1)

```json
{
  "id": "1447954390",
  "entityType": "ClinicalAnnotation",
  "name": "Annotation of rs1065852 and CYP2D6*4 with various drugs",
  "levelOfEvidence": {
    "level": "1A",
    "label": "CPIC Guideline Annotation",
    "strength": "Strong"
  },
  "relatedGenes": [
    {
      "id": "PA128",
      "symbol": "CYP2D6",
      "name": "Cytochrome P450 Family 2 Subfamily D Member 6"
    }
  ],
  "relatedChemicals": [
    {
      "id": "PA448648",
      "name": "codeine"
    }
  ],
  "annotationText": "CPIC guidelines recommend alternative analgesics...",
  "evidence": {
    "variantAnnotations": 24,
    "publications": 18,
    "guidelines": 1,
    "drugLabels": 3
  }
}
```

#### 2.5.2 Variant Annotation JSON Structure

```json
{
  "id": "VA-123456",
  "variant": {
    "id": "PA166165988",
    "name": "rs1065852 (100C>T)",
    "hgvs": "NC_000022.11:g.42130692G>A"
  },
  "gene": {
    "symbol": "CYP2D6",
    "id": "PA128"
  },
  "chemical": {
    "name": "codeine",
    "id": "PA448648"
  },
  "annotationText": "CYP2D6*4 homozygotes have decreased conversion of codeine to morphine",
  "studyParameters": {
    "studyType": "clinical trial",
    "subjects": 250,
    "pValue": 0.001,
    "effectSize": "OR 4.2"
  }
}
```

### 2.6 Update Frequency

| Data Type | Update Frequency |
|-----------|-----------------|
| Clinical Annotations | Monthly (ongoing curation) |
| Drug Labels | Monthly |
| CPIC Guidelines | Within 2 weeks of CPIC publication |
| Variant Annotations | Continuous (batch monthly) |
| Pathways | Quarterly |

### 2.7 Integration Approach

```
┌─────────────────────────────────────────────────────────────┐
│                    CLINPGX INTEGRATION                       │
├─────────────────────────────────────────────────────────────┤
│ 1. Query gene symbol → GET /data/gene?symbol=CYP2D6        │
│    → Extract PA ID (e.g., PA128)                            │
│                                                             │
│ 2. Get clinical annotations → Browse or use bulk download   │
│    → Map PA ID to clinical annotation IDs                   │
│                                                             │
│ 3. Download guideline annotations JSON                      │
│    → Parse CPIC/DPWG recommendations                        │
│                                                             │
│ 4. Cross-reference with local VCF variants                  │
│    → Match rsIDs to patient genotypes                       │
│                                                             │
│ 5. Assign evidence levels and generate report               │
└─────────────────────────────────────────────────────────────┘
```

### 2.8 Limitations

- **No direct patient genotype input:** ClinPGx does not accept patient VCF files; it provides reference data only
- **Gene symbol API restrictions:** Clinical annotations cannot be queried directly by gene symbol
- **Rate limiting:** 2 requests/second limits large-scale queries without bulk download
- **Academic/non-commercial focus:** While CC BY-SA 4.0 allows commercial use, the data is curated for research
- **Coverage gaps:** Not all drugs have equivalent levels of evidence; psychiatric medications have variable coverage
- **Phenotype prediction:** Does not directly assign metabolizer status; requires CPIC guidelines for this

---

## 3. CPIC Guidelines

### 3.1 Overview

**Name:** Clinical Pharmacogenetics Implementation Consortium
**Primary URL:** https://www.clinpgx.org/cpic/guidelines
**Former URL:** https://cpicpgx.org (redirects to ClinPGx)
**Primary Institution:** Stanford University & St. Jude Children's Research Hospital
**Funding:** NIH/NHGRI (U24HG013077)
**Founded:** 2009
**Guidelines Published:** 29+ gene-drug guidelines (as of 2026)

### 3.2 Description

CPIC is an international consortium that creates peer-reviewed, evidence-based, updatable gene/drug clinical practice guidelines. CPIC guidelines are designed to help clinicians understand **HOW** available genetic test results should be used to optimize drug therapy, rather than **WHETHER** tests should be ordered.

Each CPIC guideline follows a standard format including:
- System for grading levels of evidence linking genotypes to phenotypes
- Standardized phenotype assignment rules
- Prescribing recommendations based on genotype/phenotype
- Standard system for assigning strength to each prescribing recommendation
- Allele definition tables with function assignments
- Dosing recommendations by phenotype

### 3.3 License

**License:** CPIC is a registered service mark of HHS. Guidelines are freely available.
**Data Access:** Open access, no registration required
**Commercial Use:** Allowed with appropriate attribution
**Citation:** Cite the specific CPIC guideline publication

### 3.4 Gene-Specific Guidelines

#### 3.4.1 Active CPIC Guidelines (29 Guidelines as of 2026)

| Guideline | Gene(s) | Drug Class | Status |
|-----------|---------|-----------|--------|
| CYP2D6 + Codeine | CYP2D6 | Opioid analgesic | Active |
| CYP2D6 + Atomoxetine | CYP2D6 | ADHD medication | Active |
| CYP2D6 + Ondansetron/Tropisetron | CYP2D6 | Antiemetics | Active |
| CYP2D6 + Tamoxifen | CYP2D6 | SERM/anticancer | Active |
| CYP2D6 + Beta-Blockers | CYP2D6, ADRB1, ADRB2, ADRA2C, GRK4, GRK5 | Cardiovascular | Active |
| CYP2C19 + Clopidogrel | CYP2C19 | Antiplatelet | Active |
| CYP2C19 + PPIs | CYP2C19 | Proton pump inhibitors | Active |
| CYP2C19 + Voriconazole | CYP2C19 | Antifungal | Active |
| CYP2C19 + SSRIs | CYP2C19 | Antidepressants | Active |
| CYP2C9 + NSAIDs | CYP2C8, CYP2C9 | Analgesics/anti-inflammatory | Active |
| CYP2C9 + Phenytoin | CYP2C9, HLA-B | Antiepileptic | Active |
| CYP2C9 + Warfarin | CYP2C9, VKORC1, CYP4F2 | Anticoagulant | Active |
| CYP2B6 + Efavirenz | CYP2B6 | Antiretroviral | Active |
| CYP2B6 + Methadone | CYP2B6 | Opioid analgesic | Active |
| TPMT + Thiopurines | TPMT, NUDT15 | Immunosuppressants | Active |
| DPYD + Fluoropyrimidines | DPYD | Anticancer | Active |
| UGT1A1 + Irinotecan | UGT1A1 | Anticancer | Active |
| HLA-B + Allopurinol | HLA-B | Antigout | Active |
| HLA-B + Carbamazepine | HLA-B | Antiepileptic | Active |
| CFTR + Ivacaftor | CFTR | Cystic fibrosis | Active |
| G6PD + Primaquine/Tafenoquine | G6PD | Antimalarial | Active |
| SLCO1B1 + Simvastatin | SLCO1B1 | Statin | Active |
| RYR1/CACNA1S + Anesthetics | RYR1, CACNA1S | Anesthetics | Active |
| CYP3A5 + Tacrolimus | CYP3A5 | Immunosuppressant | Active |
| IFNL3 + Boceprevir | IFNL3 (IL28B) | Antiviral | Active |
| NUDT15 + Thiopurines | NUDT15 | Immunosuppressants | Active |
| CYP2D6 + Tricyclic Antidepressants | CYP2D6, CYP2C19 | Antidepressants | Active |
| CYP2C19 + TCAs/SSRIs | CYP2C19, CYP2D6 | Antidepressants | Active |

### 3.5 CPIC Phenotype Assignment System

#### 3.5.1 CYP2D6 Activity Score System

CPIC uses an activity score system for CYP2C19, CYP2D6, and other genes:

| Diplotype | Activity Score | Phenotype |
|-----------|---------------|-----------|
| *1/*1, *1/*2 | 2.0 | Normal Metabolizer (NM) |
| *1/*9, *1/*10, *1/*17 | 1.0-1.5 | Intermediate Metabolizer (IM) |
| *9/*10, *10/*10 | 0.5 | Intermediate Metabolizer (IM) |
| *3/*4, *4/*4, *5/*5 | 0 | Poor Metabolizer (PM) |
| *1/*1xN, *1/*2xN | >2.0 | Ultrarapid Metabolizer (UM) |

**Note:** Gene duplications (*xN) increase activity score. Gene deletions (*5) have no function.

#### 3.5.2 CPIC Function Categories

| Function Category | Activity Score Range | Clinical Significance |
|-------------------|---------------------|----------------------|
| Normal Function | 1.5-2.0 | Standard dosing |
| Decreased Function | 0.5-1.0 | Reduced metabolism; may need dose adjustment |
| No Function | 0 | Minimal/absent metabolism; alternative drug recommended |
| Increased Function | >2.0 | Enhanced metabolism; may need dose increase |
| Uncertain/Unknown | N/A | No recommendation possible |

### 3.6 Allele Definition Tables

CPIC provides comprehensive allele definition tables for each gene:

| Component | Description |
|-----------|-------------|
| Allele Name | Star allele designation (e.g., *1, *2, *4, *17) |
| Defining Variants | rsIDs and HGVS nomenclature for each variant |
| Function | Normal, decreased, no function, increased, or uncertain |
| Frequency Tables | Population allele frequencies (major ethnic groups) |
| Structural Variation | Copy number variants, gene deletions, duplications |
| Reference SNPs | dbSNP rsIDs cross-referenced |

### 3.7 CPIC Evidence Levels

| Evidence Level | Description |
|---------------|-------------|
| **A** | Genotype-phenotype relationship is validated in multiple published studies |
| **B** | Genotype-phenotype relationship is supported by some published evidence |
| **C** | Genotype-phenotype relationship is theoretical based on enzyme function |
| **D** | Genotype-phenotype relationship is unknown or not well established |

### 3.8 CPIC Recommendation Strength

| Strength | Description |
|----------|-------------|
| **Strong** | Evidence is high quality; the preponderance of evidence shows an association |
| **Moderate** | Evidence is moderate quality; most evidence shows an association but limitations exist |
| **Optional** | Evidence is weak or emerging; the association is not well established |
| **No Recommendation** | Insufficient evidence or no evidence to support recommendations |

### 3.9 Downloadable Resources

| Resource | URL Pattern | Format |
|----------|------------|--------|
| Guideline PDFs | `/guideline/{PA_id}` | PDF |
| Gene-Specific Allele Tables | Available on each guideline page | HTML/Excel |
| Dosing Recommendation Tables | Available on each guideline page | HTML/PDF |
| Guideline Annotations (JSON) | `/download/file/data/guidelineAnnotations.json.zip` | JSON |

### 3.10 Data Access

| Method | URL | Authentication |
|--------|-----|---------------|
| Web Interface | https://www.clinpgx.org/cpic/guidelines | None |
| JSON Downloads | https://api.clinpgx.org/v1/download/file/data/guidelineAnnotations.json.zip | None |
| API | https://api.clinpgx.org/v1/data/guideline/{id} | None |

### 3.11 Update Frequency

- New guidelines: As prioritized by CPIC Steering Committee
- Guideline updates: Every 2-3 years or when new evidence warrants revision
- Allele tables: Updated when new alleles are defined by PharmVar
- Current guideline count: 29 active guidelines

### 3.12 Limitations

- **Gene coverage:** Limited to 29 gene-drug pairs (expanding but not comprehensive)
- **Ethnic diversity:** Frequency tables may not cover all populations
- **Structural variants:** CYP2D6 copy number variation is complex and may not be captured by standard genotyping
- **Phenotype assignment:** Requires accurate star allele calling from VCF data
- **Implementation gap:** Guidelines exist but clinical adoption remains limited

---

## 4. ClinVar

### 4.1 Overview

**Name:** ClinVar
**Primary URL:** https://www.ncbi.nlm.nih.gov/clinvar
**FTP URL:** https://ftp.ncbi.nlm.nih.gov/pub/clinvar/
**API:** E-utilities / NCBI Entrez API
**Primary Institution:** National Center for Biotechnology Information (NCBI), NIH
**First Released:** 2013
**Records:** 3+ million variant interpretations

### 4.2 Description

ClinVar is a freely accessible, public archive of reports of the relationships among human variations and phenotypes, with supporting evidence. It aggregates and curates submissions from clinical laboratories, research groups, locus-specific databases, and expert panels.

For pharmacogenomics, ClinVar is used to:
- Validate the clinical significance of PGx variants
- Cross-reference variant interpretations across submitters
- Access star-rated evidence classifications
- Link variants to conditions and drug responses

### 4.3 License

**License:** Public Domain (US Government work)
**Commercial Use:** Unrestricted
**Attribution Required:** Recommended but not required
**Citation:** PMID: 26582918 (Landrum et al., 2016)

### 4.4 Data Access Methods

#### 4.4.1 FTP Bulk Download

| File | URL | Format | Update |
|------|-----|--------|--------|
| VCV Full Release | `ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz` | XML (new) | Monthly (1st Thursday) |
| RCV Full Release | `ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/RCV_release/ClinVarRCVRelease_00-latest.xml.gz` | XML (new) | Monthly |
| VCF File | `ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz` | VCF (GRCh38) | Monthly |
| VCF File (GRCh37) | `ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh37/clinvar.vcf.gz` | VCF (GRCh37) | Monthly |
| Summary TSV | `ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz` | TSV | Monthly |
| Cross-references | `ftp.ncbi.nlm.nih.gov/pub/clinvar/disease_name/` | TSV | Monthly |

#### 4.4.2 E-utilities API

```
Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
```

| E-utilities Function | Endpoint | Description |
|---------------------|----------|-------------|
| Search | `esearch.fcgi` | Search ClinVar database |
| Summary | `esummary.fcgi` | Retrieve document summaries |
| Fetch | `efetch.fcgi` | Retrieve full records |
| Post | `epost.fcgi` | Upload UIDs for batch operations |

**Example queries:**
```
Search: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=CYP2D6[GENE]&retmax=100
Summary: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id={IDs}
Fetch: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=clinvar&id={id}&rettype=vcv&is_variationid
```

#### 4.4.3 ClinVar Submission API

For programmatic submission of variant classifications:
- URL: `https://submit.ncbi.nlm.nih.gov/api/v1/submissions/`
- Authentication: SP-API-KEY header (64-character alphanumeric)
- Format: JSON
- Batch size: Up to 10,000 records per submission
- Requires: Service account registration with NCBI

### 4.5 ClinVar Star Rating System

| Stars | Classification | Description | PGx Utility |
|-------|---------------|-------------|-------------|
| **0** | No assertion provided | Submitter did not provide classification | Low |
| **0** | No assertion criteria provided | No criteria provided for classification | Low |
| **1** | Criteria provided, single submitter | One lab/classification method | Moderate |
| **2** | Criteria provided, multiple submitters, no conflicts | Multiple labs agree | Good |
| **3** | Criteria provided, multiple submitters, conflicts | Multiple labs disagree | Requires review |
| **4** | Practice guideline | Professional society guideline (CPIC, ACMG) | **Highest** |
| **4** | Reviewed by expert panel | Expert panel consensus | **Highest** |

### 4.6 Clinical Significance Categories

| Category | Description |
|----------|-------------|
| Pathogenic | Disease-causing variant |
| Likely pathogenic | Probably disease-causing |
| Uncertain significance | Insufficient evidence |
| Likely benign | Probably not disease-causing |
| Benign | Not disease-causing |
| Drug response | Affects drug response (PGx-relevant) |
| Risk factor | Modifies disease risk |
| Protective | Decreases disease risk |
| Affects | Affects gene function |
| Association | Associated with phenotype |
| Conflicting interpretations | Different labs disagree |

### 4.7 ClinVar PGx-Specific Use

For pharmacogenomics applications, filter ClinVar records by:
1. **Origin:** `germline` (inherited variants)
2. **Clinical significance:** `drug response`
3. **Gene:** CYP2D6, CYP2C19, CYP2C9, SLCO1B1, TPMT, DPYD, etc.
4. **Star rating:** 2+ stars for higher confidence
5. **Review status:** `reviewed by expert panel` or `practice guideline`

### 4.8 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Full monthly release | 1st Thursday of each month |
| Weekly XML updates | Every Monday (superseded by monthly) |
| VCF files | Monthly |
| Web interface | Real-time |

### 4.9 Limitations

- **Submission bias:** Data reflects what submitters choose to report; not comprehensive
- **Conflicting interpretations:** Same variant may have different classifications
- **HGVS compliance:** Not all submissions use standardized HGVS nomenclature
- **PGx specificity:** ClinVar covers all variant types; PGx is a subset
- **Gene-drug pairs:** Must be cross-referenced with PharmGKB/CPIC for drug context
- **Population data:** No allele frequencies (use gnomAD/1000G for frequencies)

---

## 5. PharmVar

### 5.1 Overview

**Name:** Pharmacogene Variation Consortium
**Primary URL:** https://www.pharmvar.org
**API Documentation:** https://www.pharmvar.org/documentation
**Primary Institution:** Children's Mercy Kansas City
**First Released:** 2018
**Version:** 6.2.22 (as of March 2026)

### 5.2 Description

PharmVar is a central repository for pharmacogene (PGx) variation focusing on haplotype structure and allelic variation. It serves as the authoritative source for pharmacogene allele definitions used by CPIC guidelines, PharmGKB, and clinical testing laboratories.

PharmVar curates:
- **CYP450 allele definitions:** Star alleles with defining variants
- **Sequence variants:** HGVS-compliant variant nomenclature
- **Haplotype structure:** Phased variant combinations
- **Allele function:** CPIC clinical function assignments
- **Reference materials:** Consensus sequences and reference materials

### 5.3 License

**License:** Free for academic and commercial use
**API Access:** Requires free PharmVar account and API key
**Data Access:** Open access for browsing; API key for programmatic access
**Citation:** Cite PharmVar publications listed at https://www.pharmvar.org/publications
**Terms of Service:** https://www.pharmvar.org/terms-and-conditions

### 5.4 Data Access Methods

#### 5.4.1 REST API (v2)

| Feature | Details |
|---------|---------|
| Base URL | `https://www.pharmvar.org` |
| Authentication | API key required (free account) |
| Rate Limit | 2 requests per second |
| Format | JSON |
| Documentation | Swagger UI at `/v2/api-docs` |

**Key Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api-service/genes` | GET | All genes in PharmVar |
| `/api-service/genes/list` | GET | List of all gene symbols |
| `/api-service/genes/{symbol}` | GET | Gene info by symbol (e.g., CYP2D6) |
| `/api-service/genes/entrez-gene/{id}` | GET | Gene by Entrez Gene ID |
| `/api-service/genes/hgnc/{id}` | GET | Gene by HGNC ID |
| `/api-service/genes/pharmgkb/{id}` | GET | Gene by PharmGKB/ClinPGx PA ID |
| `/api-service/alleles` | GET | All alleles in database |
| `/api-service/alleles/list` | GET | List of active alleles |
| `/api-service/alleles/{identifier}` | GET | Specific allele by name or PVID |
| `/api-service/alleles/{identifier}/function` | GET | CPIC clinical function |
| `/api-service/alleles/{identifier}/variants` | GET | Defining variants for allele |
| `/api-service/alleles/{identifier}/evidence-level` | GET | Evidence level |
| `/api-service/variants` | GET | All variants |
| `/api-service/variants/allele/{identifier}` | GET | Variants for a specific allele |

#### 5.4.2 Web Interface

| Feature | URL |
|---------|-----|
| Gene list | https://www.pharmvar.org/genes |
| Allele browser | https://www.pharmvar.org/genes/{symbol} |
| Variant details | Available through gene pages |
| Publications | https://www.pharmvar.org/publications |
| Resources | https://www.pharmvar.org/resources |

### 5.5 Gene Coverage

PharmVar currently curates the following pharmacogenes:

| Gene | Family | Clinical Relevance | Allele Count |
|------|--------|-------------------|--------------|
| CYP1A2 | CYP450 | Clozapine, olanzapine, caffeine | 40+ |
| CYP2B6 | CYP450 | Efavirenz, methadone, bupropion | 70+ |
| CYP2C8 | CYP450 | Pioglitazone, paclitaxel | 20+ |
| CYP2C9 | CYP450 | Warfarin, NSAIDs, phenytoin | 90+ |
| CYP2C19 | CYP450 | Clopidogrel, PPIs, SSRIs | 90+ |
| CYP2D6 | CYP450 | Codeine, tamoxifen, antidepressants | 150+ |
| CYP2E1 | CYP450 | Isoniazid, acetaminophen | 10+ |
| CYP3A4 | CYP450 | Fentanyl, statins, immunosuppressants | 50+ |
| CYP3A5 | CYP450 | Tacrolimus, sirolimus | 20+ |
| CYP4F2 | CYP450 | Warfarin | 10+ |
| DPYD | Metabolic | 5-fluorouracil, capecitabine | 20+ |
| G6PD | Metabolic | Primaquine, dapsone | 200+ |
| NUDT15 | Metabolic | Thiopurines | 10+ |
| TPMT | Metabolic | Azathioprine, 6-mercaptopurine | 40+ |
| UGT1A1 | UGT | Irinotecan, atazanavir | 50+ |
| SLCO1B1 | Transporter | Simvastatin | 50+ |
| VKORC1 | Target | Warfarin | 10+ |

### 5.6 Allele Function Assignment

PharmVar integrates CPIC clinical function assignments:

| Function | Description |
|----------|-------------|
| Normal function | Wild-type or fully functional enzyme |
| Decreased function | Reduced enzyme activity |
| No function | Absent or essentially no enzyme activity |
| Increased function | Enhanced enzyme activity |
| Uncertain/Unknown | Insufficient data |
| Not applicable | e.g., for structural variants |

### 5.7 Data Model

#### 5.7.1 Allele JSON Structure (API v2)

```json
{
  "alleleName": "CYP2D6*4",
  "pvid": "PVID-12345",
  "geneSymbol": "CYP2D6",
  "function": {
    "cpicFunction": "No Function",
    "evidenceLevel": "Definitive"
  },
  "definingVariants": [
    {
      "rsId": "rs1065852",
      "hgvs": "NM_000106.6:c.100C>T",
      "proteinEffect": "p.Pro34Ser",
      "variantType": "SNV"
    },
    {
      "rsId": "rs3892097",
      "hgvs": "NM_000106.6:c.1846G>A",
      "proteinEffect": "p.Splice defect",
      "variantType": "Splice site"
    }
  ],
  "references": [
    {
      "pmid": 12345678,
      "title": "Characterization of CYP2D6*4..."
    }
  ]
}
```

### 5.8 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Database release | Quarterly |
| API updates | With each release |
| New allele submissions | Continuous review |
| Gene Focus articles | Periodic |

### 5.9 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│                  PHARMVAR INTEGRATION                     │
├──────────────────────────────────────────────────────────┤
│ 1. Obtain API key (free account at pharmvar.org)         │
│                                                          │
│ 2. Query gene: GET /api-service/genes/CYP2D6             │
│    → Get gene metadata and available alleles             │
│                                                          │
│ 3. Query allele: GET /api-service/alleles/CYP2D6*4       │
│    → Get defining variants and function                  │
│                                                          │
│ 4. Match patient VCF variants to allele definitions      │
│    → Build diplotype (e.g., *1/*4)                       │
│                                                          │
│ 5. Query function: GET /api-service/alleles/*4/function  │
│    → Map to CPIC phenotype                               │
│                                                          │
│ 6. Cross-reference with CPIC dosing guidelines           │
└──────────────────────────────────────────────────────────┘
```

### 5.10 Limitations

- **API key required:** Unlike ClinPGx, PharmVar requires account registration
- **Rate limiting:** 2 requests/second
- **Structural variants:** Complex structural variation (CNVs, hybrid genes) may not be fully captured
- **Population coverage:** Allele frequency data limited to published studies
- **CYP2D6 complexity:** The CYP2D6 gene region is highly complex with pseudogenes, CNVs, and rearrangements
- **Phased data:** Haplotype phasing may be ambiguous from standard VCF files

---

## 6. FDA Pharmacogenomic Biomarkers

### 6.1 Overview

**Name:** Table of Pharmacogenomic Biomarkers in Drug Labeling
**Primary URL:** https://www.fda.gov/drugs/science-and-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling
**Maintainer:** FDA Division of Translational and Precision Medicine (DTPM)
**Contact:** pharmacogenomics@fda.hhs.gov
**Last Updated:** March 3, 2026

### 6.2 Description

The FDA maintains a comprehensive table of all FDA-approved drug labels that contain pharmacogenomic information. This table is the authoritative regulatory source for PGx biomarkers in drug labeling, covering:

- **Actionable genetic variants:** Variants that require specific clinical actions
- **Biomarker categories:** Germline variants, somatic mutations, gene expression, chromosomal abnormalities
- **Label sections:** Where PGx information appears (Indications, Dosage, Warnings, etc.)
- **Therapeutic areas:** Oncology, psychiatry, cardiology, infectious disease, etc.

### 6.3 License

**License:** Public Domain (US Government work)
**Commercial Use:** Unrestricted
**Attribution Required:** Not required but recommended

### 6.4 Data Access Methods

#### 6.4.1 Web Table

Interactive, searchable, and exportable table at the FDA website. Features:
- Search by drug name, biomarker, therapeutic area
- Export to Excel
- Direct links to drug labels at Drugs@FDA

#### 6.4.2 Downloadable Files

| File | URL | Format | Size |
|------|-----|--------|------|
| Detailed PDF | Available on page | PDF | 4.3 KB |
| Excel Export | Via web interface | XLSX | Variable |

#### 6.4.3 Notable Psychiatry-Related Entries

| Drug | Biomarker | Therapeutic Area | Label Sections |
|------|-----------|-----------------|----------------|
| Amitriptyline | CYP2D6 | Psychiatry | Precautions |
| Amoxapine | CYP2D6 | Psychiatry | Precautions |
| Aripiprazole | CYP2D6 | Psychiatry | Dosage, Clinical Pharmacology |
| Aripiprazole Lauroxil | CYP2D6 | Psychiatry | Dosage, Clinical Pharmacology |
| Atomoxetine | CYP2D6 | Psychiatry | Dosage, Warnings, Drug Interactions |
| Brexpiprazole | CYP2D6 | Psychiatry | Dosage, Clinical Pharmacology |
| Amphetamine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Carisoprodol | CYP2C19 | Neurology | Clinical Pharmacology |
| Citalopram | CYP2C19, CYP2D6 | Psychiatry | Warnings, Clinical Pharmacology |
| Clomipramine | CYP2D6 | Psychiatry | Warnings |
| Clozapine | CYP1A2, CYP2D6 | Psychiatry | Dosage, Drug Interactions |
| Desipramine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Doxepin | CYP2C19, CYP2D6 | Psychiatry | Clinical Pharmacology |
| Escitalopram | CYP2C19, CYP2D6 | Psychiatry | Clinical Pharmacology |
| Fluoxetine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Fluvoxamine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Iloperidone | CYP2D6 | Psychiatry | Dosage, Clinical Pharmacology |
| Imipramine | CYP2C19, CYP2D6 | Psychiatry | Clinical Pharmacology |
| Modafinil | CYP2D6 | Neurology | Clinical Pharmacology |
| Nortriptyline | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Paroxetine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Pimozide | CYP2D6 | Psychiatry | Warnings |
| Quetiapine | CYP3A4, CYP3A5 | Psychiatry | Dosage |
| Sertraline | CYP2C19, CYP2D6 | Psychiatry | Clinical Pharmacology |
| Thioridazine | CYP2D6 | Psychiatry | Warnings |
| Trimipramine | CYP2C19, CYP2D6 | Psychiatry | Clinical Pharmacology |
| Venlafaxine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Vortioxetine | CYP2D6 | Psychiatry | Clinical Pharmacology |
| Warfarin | CYP2C9, VKORC1, CYP4F2 | Cardiology | Dosage, Clinical Pharmacology |

### 6.5 Label Section Categories

| Section | Description |
|---------|-------------|
| Indications and Usage | PGx test required/recommended for indication |
| Dosage and Administration | Genotype-specific dosing |
| Warnings and Precautions | Risk of adverse events by genotype |
| Adverse Reactions | Genotype-specific adverse event data |
| Drug Interactions | PGx-based drug-drug interactions |
| Use in Specific Populations | Population-specific PGx considerations |
| Clinical Pharmacology | PK/PD data by genotype |
| Clinical Studies | Trial results stratified by genotype |
| Patient Counseling Information | PGx information for patients |

### 6.6 Biomarker Categories

| Category | Description | Examples |
|----------|-------------|----------|
| Germline variants | Inherited genetic variants | CYP2D6, CYP2C19, TPMT |
| Somatic mutations | Acquired mutations in tumors | EGFR, KRAS, BRAF |
| Gene expression | mRNA expression levels | ERBB2 (HER2), CD274 (PD-L1) |
| Chromosomal abnormalities | Large-scale changes | Philadelphia chromosome |
| Protein biomarkers | Protein-level markers | DPD (protein) |
| HLA alleles | Human leukocyte antigens | HLA-B*57:01, HLA-B*15:02 |

### 6.7 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Table updates | Quarterly (approximately) |
| Content current as of | Listed on page (currently 03/03/2026) |
| Drug label updates | Ongoing (individual labels) |

### 6.8 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│              FDA BIOMARKER TABLE INTEGRATION              │
├──────────────────────────────────────────────────────────┤
│ 1. Scrape/parse the HTML table or use exported Excel     │
│                                                          │
│ 2. Extract: Drug name, Biomarker, Therapeutic area,      │
│    Label sections                                        │
│                                                          │
│ 3. Cross-reference with patient genotype results         │
│    → Check if patient is on any PGx-labeled drug         │
│                                                          │
│ 4. Map to openFDA for full label text                    │
│    → Extract specific PGx recommendations                │
│                                                          │
│ 5. Generate alert if action required                     │
└──────────────────────────────────────────────────────────┘
```

### 6.9 Limitations

- **Static table:** Must be manually checked for updates
- **No API:** No programmatic API for the table itself
- **Limited context:** Table provides summary; full context requires label review
- **US-only:** Only covers FDA-approved drugs
- **Not all-inclusive:** Table excludes biomarkers used solely for diagnostics
- **No phenotype mapping:** Does not assign metabolizer status

---

## 7. openFDA

### 7.1 Overview

**Name:** openFDA
**Primary URL:** https://open.fda.gov
**API Base URL:** https://api.fda.gov
**Maintainer:** US Food and Drug Administration
**First Released:** 2014

### 7.2 Description

openFDA is an Elasticsearch-based API that serves public FDA data about drugs, devices, and foods. For pharmacogenomics, the **drug labeling** endpoint is the primary resource, providing access to:

- **Structured Product Labels (SPL):** Full text of FDA-approved drug labels
- **Pharmacogenomic sections:** PGx-specific text within labels
- **Adverse events:** FDA Adverse Event Reporting System (FAERS)
- **Enforcement reports:** Drug recall and enforcement data
- **Harmonized fields:** Cross-referenced identifiers (RxNorm, UNII, etc.)

### 7.3 License

**License:** CC0 (Creative Commons Zero) / Open Data
**Commercial Use:** Unrestricted
**Attribution Required:** Not required but appreciated
**Terms:** https://open.fda.gov/terms/

### 7.4 Data Access Methods

#### 7.4.1 Drug Labeling API

| Feature | Details |
|---------|---------|
| Base URL | `https://api.fda.gov/drug/label.json` |
| Authentication | None required (API key recommended for production) |
| Rate Limit | 240 requests/minute without key; 600/minute with key |
| Format | JSON |
| API Key URL | https://api.fda.gov/authentication/ |

**Key Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `/drug/label.json` | Drug labels (SPL) |
| `/drug/event.json` | Adverse events (FAERS) |
| `/drug/enforcement.json` | Enforcement reports |
| `/drug/ndc.json` | National Drug Code directory |

**Important Query Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `search` | Field:term search | `search=openfda.brand_name:warfarin` |
| `count` | Count aggregation | `count=openfda.pharm_class_epc` |
| `limit` | Results per page (max 1000) | `limit=100` |
| `skip` | Pagination offset | `skip=100` |

#### 7.4.2 openFDA Harmonized Fields

openFDA enriches records with harmonized cross-references:

| Field | Description | Example |
|-------|-------------|---------|
| `openfda.rxcui` | RxNorm Concept Unique Identifier | `["11289"]` |
| `openfda.unii` | Unique Ingredient Identifier | `["Q6ZQ9MYU3T"]` |
| `openfda.spl_set_id` | SPL Set ID (stable across label versions) | UUID format |
| `openfda.pharm_class_epc` | Established Pharmacologic Class | `["Selective Serotonin Reuptake Inhibitor [EPC]"]` |
| `openfda.pharm_class_pe` | Physiologic Effect | `["Serotonin Uptake Inhibition [PE]"]` |
| `openfda.nui` | NDF-RT concept identifier | NUI code |
| `openfda.manufacturer_name` | Drug manufacturer | `["Pfizer"]` |

#### 7.4.3 Available SPL Sections for PGx

| Section Field | Description |
|---------------|-------------|
| `indications_and_usage` | Indications with PGx context |
| `dosage_and_administration` | Genotype-specific dosing |
| `warnings` | PGx safety warnings |
| `precautions` | PGx precautions |
| `adverse_reactions` | Genotype-stratified adverse events |
| `drug_interactions` | PGx-mediated interactions |
| `use_in_specific_populations` | Population-specific PGx data |
| `clinical_pharmacology` | PK/PD by genotype |
| `clinical_studies` | PGx clinical trial results |
| `pharmacogenomics` | **Direct PGx field (when populated)** |
| `pregnancy` | Pregnancy PGx considerations |
| `nursing_mothers` | Lactation PGx considerations |

### 7.5 Update Frequency

| Data Type | Update Frequency |
|-----------|-----------------|
| Drug labels | Weekly |
| Adverse events | Quarterly |
| Enforcement reports | Weekly |
| NDC directory | Daily |

### 7.6 Rate Limits

| Authentication | Rate Limit |
|---------------|-----------|
| No API key | 240 requests/minute, 1000 requests/day |
| With API key | 600 requests/minute, no daily limit |

### 7.7 Limitations

- **No PGx-specific search:** Must search within full label text for PGx content
- `pharmacogenomics` field is not consistently populated across all labels
- **Elasticsearch query syntax:** Requires learning specific search syntax
- **No variant-level data:** Only drug-level information
- **US-only:** Only FDA-regulated products
- **Label lag:** Labels may not reflect latest PGx evidence

---

## 8. RxNorm / RxNav

### 8.1 Overview

**Name:** RxNorm / RxNav
**Primary URL:** https://www.nlm.nih.gov/research/umls/rxnorm
**RxNav API:** https://rxnav.nlm.nih.gov/RxNormAPIs.html
**REST API:** https://rxnav.nlm.nih.gov/RxNormAPIRest.html
**Maintainer:** National Library of Medicine (NLM)
**First Released:** 2004

### 8.2 Description

RxNorm is a standardized nomenclature for clinical drugs produced by the National Library of Medicine. It provides normalized names for clinical drugs and links its names to many of the drug vocabularies commonly used in pharmacy management and drug interaction software.

RxNorm is essential for PGx integration because it:
- **Normalizes drug names:** Maps brand names to generic ingredients
- **Provides RxCUIs:** Unique identifiers for drug concepts
- **Links to NDC:** Connects to FDA National Drug Code
- **Links to SPL:** Connects to FDA Structured Product Labels
- **Enables drug class queries:** Supports pharmacologic class searches

### 8.3 License

**License:** UMLS License (Metathesaurus License Agreement)
**Commercial Use:** Allowed with UMLS license
**Attribution Required:** Yes
**Registration Required:** Yes (free UMLS account required)
**License URL:** https://www.nlm.nih.gov/research/umls/license.html

### 8.4 Data Access Methods

#### 8.4.1 RxNorm API (RxNav)

| Feature | Details |
|---------|---------|
| Base URL | `https://rxnav.nlm.nih.gov/REST` |
| Authentication | None (but UMLS license required for data use) |
| Format | JSON or XML |
| Documentation | https://rxnav.nlm.nih.gov/RxNormAPIRest.html |

**Key Endpoints:**

| Endpoint | Description | Example |
|----------|-------------|---------|
| `/rxcui` | Get RxCUI by name | `/rxcui?name=sertraline` |
| `/rxcui/{rxcui}/properties` | Get properties | `/rxcui/8113/properties` |
| `/rxcui/{rxcui}/related` | Related concepts | Related RxNorm terms |
| `/rxcui/{rxcui}/ndcs` | Associated NDCs | `/rxcui/8113/ndcs` |
| `/rxcui/{rxcui}/allndcs` | All NDCs (historical) | All NDCs |
| `/rxcui/{rxcui}/related?tty=IN` | Ingredients | Active ingredients |
| `/rxcui/{rxcui}/related?tty=SCDC` | Clinical drug components | Strength/dose form |
| `/rxcui/{rxcui}/allProperties` | All properties | Complete property list |
| `/drugs` | Search by name | `/drugs?name=sertraline` |
| `/approximateTerm` | Approximate match | Fuzzy search |
| `/displaynames` | Display names | Common display terms |

#### 8.4.2 RxNorm Term Types (TTY)

| TTY | Description | PGx Use |
|-----|-------------|---------|
| IN | Ingredient | Active moiety for PGx mapping |
| MIN | Multiple ingredients | Combination products |
| PIN | Precise ingredient | Specific salt/form |
| BN | Brand name | Patient-reported medications |
| SCD | Semantic clinical drug | Dose form + strength + ingredient |
| SBD | Semantic branded drug | Brand name + SCD |
| DF | Dose form | Route of administration |

#### 8.4.3 UMLS Terminology Services (UTS)

For programmatic access requiring authentication:
- **UTS Login:** https://uts.nlm.nih.gov/uts/login
- **API Key:** Generated from UTS profile
- **Ticket Granting:** TGT/STG system for authentication
- **Documentation:** https://documentation.uts.nlm.nih.gov/

### 8.5 RxNorm Monthly Prescribed Edition

| Feature | Details |
|---------|---------|
| Content | Current prescribable content |
| Update | Monthly |
| Format | RRDF (Rich Release Format), API |
| Scope | Active, FDA-approved, prescribable drugs |

### 8.6 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Weekly updates | Every Monday |
| Monthly full release | Monthly |
| API cache | Updated weekly |

### 8.7 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│                 RXNORM/RXNAV INTEGRATION                  │
├──────────────────────────────────────────────────────────┤
│ 1. Patient medication list (e.g., "Zoloft 50mg tablet")  │
│                                                          │
│ 2. Query RxNav: GET /REST/drugs?name=zoloft              │
│    → Get RxCUI (e.g., 827418 = sertraline 50mg oral tab) │
│                                                          │
│ 3. Get ingredients: GET /REST/rxcui/{id}/related?tty=IN  │
│    → Extract generic name (sertraline)                    │
│                                                          │
│ 4. Map to PharmGKB/openFDA using generic name            │
│    → Query PGx annotations                                │
│                                                          │
│ 5. Cross-reference with patient genotype                  │
│    → Generate PGx recommendations                         │
└──────────────────────────────────────────────────────────┘
```

### 8.8 Limitations

- **UMLS license required:** Must agree to license terms for data use
- **US-centric:** Primarily covers US-marketed drugs
- **No PGx data:** RxNorm normalizes names but does not contain PGx annotations
- **API complexity:** Multiple API versions and term types to understand
- **Combination products:** Multi-ingredient products require parsing
- **Dietary supplements:** Limited coverage

---

## 9. DailyMed

### 9.1 Overview

**Name:** DailyMed
**Primary URL:** https://dailymed.nlm.nih.gov
**API:** https://dailymed.nlm.nih.gov/dailymed/app-info.cfm
**Maintainer:** National Library of Medicine (NLM)
**First Released:** 2005

### 9.2 Description

DailyMed is NLM's repository of FDA-approved drug labels in structured product labeling (SPL) format. It provides:

- **Complete drug labels:** All FDA-approved prescription and OTC drug labels
- **SPL XML format:** Machine-readable structured product labels
- **Historical labels:** Archive of label versions over time
- **Mapping files:** NDC-to-SetID mappings for cross-referencing

DailyMed is the authoritative source for the full text of FDA drug labels and is used by openFDA and other systems.

### 9.3 License

**License:** Public Domain (US Government work)
**Commercial Use:** Unrestricted
**Attribution Required:** Not required

### 9.4 Data Access Methods

#### 9.4.1 Web Interface

URL: https://dailymed.nlm.nih.gov/dailymed/search.cfm

#### 9.4.2 SPL Download Service

| Feature | Details |
|---------|---------|
| Format | SPL XML (HL7 standard) |
| Access | Web download or bulk download |
| Schema | HL7 SPL R4 |
| URL Pattern | `https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid={SET_ID}&type=xml` |

#### 9.4.3 DailyMed API

| Endpoint | Description |
|----------|-------------|
| `/dailymed/services/v2/spls.json` | List SPLs |
| `/dailymed/services/v2/spls/{set_id}.json` | SPL by SetID |
| `/dailymed/services/v2/spls/{set_id}.xml` | SPL XML by SetID |
| `/dailymed/lookup.cfm?setid={SET_ID}` | Web lookup |

#### 9.4.4 Bulk Download

| Resource | URL | Description |
|----------|-----|-------------|
| SPL ZIP files | `https://dailymed.nlm.nih.gov/dailymed/spl/` | Monthly SPL archives |
| NDC-to-SetID mapping | Available via API | Maps NDC codes to SPL SetIDs |

#### 9.4.5 SPL Structure for PGx

SPL XML contains labeled sections relevant to pharmacogenomics:

```xml
<sections>
  <section>
    <code code="34066-1" displayName="DOSAGE & ADMINISTRATION"/>
    <title>Dosage and Administration</title>
    <text>
      <!-- Genotype-specific dosing recommendations -->
    </text>
  </section>
  <section>
    <code code="43679-0" displayName="WARNINGS AND PRECAUTIONS"/>
    <title>Warnings and Precautions</title>
    <text>
      <!-- PGx safety warnings -->
    </text>
  </section>
  <section>
    <code code="34090-1" displayName="CLINICAL PHARMACOLOGY"/>
    <title>Clinical Pharmacology</title>
    <text>
      <!-- PK/PD information by genotype -->
    </text>
  </section>
  <!-- Additional sections -->
</sections>
```

**LOINC Codes for SPL Sections:**

| LOINC Code | Section | PGx Relevance |
|-----------|---------|--------------|
| 34066-1 | Dosage & Administration | Genotype-specific dosing |
| 43679-0 | Warnings and Precautions | PGx safety alerts |
| 34090-1 | Clinical Pharmacology | PK/PD by genotype |
| 43683-2 | Drug Interactions | PGx-mediated interactions |
| 34084-4 | Indications & Usage | PGx test requirements |
| 34088-5 | Adverse Reactions | Genotype-stratified AEs |
| 68713-0 | Pharmacogenomics | **Direct PGx section** |

### 9.5 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| New label uploads | Daily |
| Label updates | As submitted by manufacturers |
| Full SPL archive | Monthly |

### 9.6 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│                  DAILYMED INTEGRATION                     │
├──────────────────────────────────────────────────────────┤
│ 1. Get SPL SetID from openFDA or NDC mapping             │
│                                                          │
│ 2. Download SPL XML: /getFile.cfm?setid={SET_ID}         │
│                                                          │
│ 3. Parse XML sections using LOINC codes                  │
│    → Extract Dosage, Warnings, Clinical Pharmacology     │
│                                                          │
│ 4. Search extracted text for PGx keywords                │
│    → "CYP2D6", "poor metabolizer", "genotype", etc.      │
│                                                          │
│ 5. Flag labels with PGx content for clinician review     │
└──────────────────────────────────────────────────────────┘
```

### 9.7 Limitations

- **XML complexity:** SPL XML is complex and requires XML parsing expertise
- **Text search required:** PGx content is embedded in narrative text
- **No structured PGx fields:** Pharmacogenomics section (68713-0) not consistently used
- **Volume:** Thousands of labels require batch processing
- **No allele data:** Labels reference genes/phenotypes, not specific alleles
- **Update delays:** Label changes may lag behind clinical evidence

---

## 10. GWAS Catalog

### 10.1 Overview

**Name:** NHGRI-EBI Catalog of human genome-wide association studies
**Primary URL:** https://www.ebi.ac.uk/gwas
**Downloads:** https://www.ebi.ac.uk/gwas/docs/file-downloads
**Maintainer:** European Bioinformatics Institute (EBI) / National Human Genome Research Institute (NHGRI)
**First Released:** 2008
**Records:** 500,000+ SNP-trait associations

### 10.2 Description

The GWAS Catalog is a curated resource of all published genome-wide association studies. It provides:

- **SNP-trait associations:** p-values, effect sizes, risk alleles
- **Study metadata:** Sample sizes, populations, genotyping platforms
- **Ontology annotations:** Experimental Factor Ontology (EFO) terms
- **Summary statistics:** Links to full summary statistics files

For pharmacogenomics, the GWAS Catalog can identify:
- Novel gene-drug associations
- Population-specific variant effects
- Polygenic risk scores for drug response
- Adverse drug reaction associations

### 10.3 License

**License:** Creative Commons Zero (CC0)
**Commercial Use:** Unrestricted
**Attribution Required:** Not required
**Citation:** PMID: 30445434 (Buniello et al., 2019)

### 10.4 Data Access Methods

#### 10.4.1 Bulk Downloads

| File | URL Pattern | Format | Size |
|------|------------|--------|------|
| All associations v1.0 | `/api/search/downloads/alternative` | TSV (zipped) | ~40 MB |
| All associations v1.0.2 | `/api/search/downloads/full` | TSV (zipped) | ~60 MB |
| All studies v1.0.2.1 | `/api/search/downloads/studies` | TSV | ~5 MB |
| All studies v1.0.3.1 | `/api/search/downloads/studies_new` | TSV | ~8 MB |
| All ancestries v1.0 | `/api/search/downloads/ancestries` | TSV | ~3 MB |

**Full download URL:** `https://www.ebi.ac.uk/gwas/api/search/downloads/{file}`

#### 10.4.2 Download Columns (Associations)

| Column | Description | PGx Relevance |
|--------|-------------|---------------|
| DATE ADDED TO CATALOG | Date of curation | Track updates |
| PUBMEDID | Publication PMID | Access original study |
| FIRST AUTHOR | Lead author | Reference |
| DATE | Publication date | Evidence recency |
| JOURNAL | Publication journal | Journal impact |
| LINK | Study URL | Access full text |
| STUDY | Study title | Context |
| DISEASE/TRAIT | Phenotype/trait | Drug response phenotype |
| INITIAL SAMPLE SIZE | Discovery cohort | Power assessment |
| REPLICATION SAMPLE SIZE | Replication cohort | Replication evidence |
| REGION | Genomic region | Gene mapping |
| CHR_ID | Chromosome | Variant location |
| CHR_POS | Chromosome position | Variant mapping |
| REPORTED GENE(S) | Gene(s) reported | Candidate gene |
| MAPPED_GENE | Curated gene | Confirmed gene |
| UPSTREAM_GENE_ID | Upstream gene | Regulatory variant |
| DOWNSTREAM_GENE_ID | Downstream gene | Regulatory variant |
| SNP_GENE_IDS | Gene IDs for SNP | Functional mapping |
| UPSTREAM_GENE_DISTANCE | Distance to upstream gene | Proximity analysis |
| DOWNSTREAM_GENE_DISTANCE | Distance to downstream gene | Proximity analysis |
| STRONGEST SNP-RISK ALLELE | Risk allele | Effect allele |
| SNPS | rsID | Variant identifier |
| MERGED | Merge status | dbSNP integration |
| SNP_ID_CURRENT | Current rsID | ID resolution |
| CONTEXT | Variant consequence | Functional annotation |
| INTERGENIC | Intergenic flag | Non-coding variant |
| RISK ALLELE FREQUENCY | RAF in study | Population frequency |
| P-VALUE | Association p-value | Statistical significance |
| PVALUE_MLOG | -log10(p-value) | Significance magnitude |
| P-VALUE (TEXT) | P-value context | Methodology |
| OR or BETA | Effect size | Clinical magnitude |
| 95% CI (TEXT) | Confidence interval | Precision |
| PLATFORM [SNPs passing QC] | Genotyping array | Coverage assessment |
| CNV | Copy number variant | Structural variation |
| MAPPED_TRAIT | EFO trait term | Ontology mapping |
| MAPPED_TRAIT_URI | EFO URI | Linked data |
| STUDY ACCESSION | GC accession | Unique study ID |
| GENOTYPING TECHNOLOGY | Genotyping method | Platform bias |

### 10.4.3 Search API

| Endpoint | Description |
|----------|-------------|
| `/gwas/api/search?q={query}` | General search |
| `/gwas/rest/api/studies/{accession}` | Study details |
| `/gwas/rest/api/associations/{id}` | Association details |
| `/gwas/rest/api/singleNucleotidePolymorphisms/{rsid}` | SNP details |
| `/gwas/rest/api/efoTraits/{EFO_id}` | Trait associations |

### 10.5 GWAS for Pharmacogenomics

#### 10.5.1 Relevant PGx GWAS Traits

| Trait Category | Example Traits | PGx Application |
|---------------|----------------|-----------------|
| Drug response | Warfarin dose, clopidogrel response | Dosing algorithms |
| Adverse drug reactions | Stevens-Johnson syndrome, DILI | Safety prediction |
| Drug levels | Plasma drug concentrations | PK prediction |
| Treatment outcomes | Antidepressant response, remission | Efficacy prediction |
| Addiction | Nicotine dependence, opioid use disorder | Risk stratification |

#### 10.5.2 Notable PGx GWAS Studies

| PMID | Drug | Gene/Variant | Finding |
|------|------|-------------|---------|
| 20461345 | Warfarin | CYP2C9, VKORC1 | Dosing algorithm GWAS |
| 19300499 | Clopidogrel | CYP2C19 | Loss-of-function variants |
| 21487299 | Simvastatin | SLCO1B1 | Myopathy risk |
| 24326908 | Carbamazepine | HLA-A*31:01 | SJS/TEN risk |
| 25962157 | Allopurinol | HLA-B*58:01 | Severe cutaneous ADR |

### 10.6 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Curated associations | Biweekly |
| Full data release | Biweekly |
| Summary statistics links | Monthly |

### 10.7 Limitations

- **Discovery bias:** GWAS may miss rare variants and structural variants
- **Population bias:** Most studies in European ancestry populations
- **Multiple testing:** p-values require careful interpretation
- **Functional validation:** GWAS identifies associations, not mechanisms
- **No clinical guidelines:** GWAS findings require translation via CPIC/PharmGKB
- **Effect sizes:** Small effect sizes for most common variants

---

## 11. dbSNP

### 11.1 Overview

**Name:** Database of Single Nucleotide Polymorphisms
**Primary URL:** https://www.ncbi.nlm.nih.gov/snp
**FTP:** https://ftp.ncbi.nlm.nih.gov/snp/
**API:** E-utilities / NCBI Variation Services
**Maintainer:** National Center for Biotechnology Information (NCBI)
**First Released:** 1998
**Records:** 1.8 billion+ reference SNPs (build 156)

### 11.2 Description

dbSNP is NCBI's database of short genetic variations, including single nucleotide variations (SNVs), microsatellites, and small insertions/deletions. It serves as the primary reference for SNP identifiers (rs numbers) used across all PGx resources.

For pharmacogenomics, dbSNP provides:
- **Reference SNP identifiers (rsIDs):** Universal variant identifiers
- **Allele frequencies:** Population-specific frequencies (ALFA project)
- **Variant consequences:** Functional predictions (RefSeq gene consequences)
- **Cross-references:** Links to ClinVar, PharmGKB, PharmVar, publications
- **HGVS expressions:** Standardized variant nomenclature

### 11.3 License

**License:** Public Domain (US Government work)
**Commercial Use:** Unrestricted
**Attribution Required:** Not required

### 11.4 Data Access Methods

#### 11.4.1 E-utilities API

```
Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
```

| Function | Endpoint | Description |
|----------|----------|-------------|
| Search | `esearch.fcgi?db=snp` | Search dbSNP |
| Summary | `esummary.fcgi?db=snp` | Get SNP summaries |
| Fetch | `efetch.fcgi?db=snp` | Get full records |

**Example queries:**
```
Search: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=rs1065852
Summary: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=snp&id=1065852
```

#### 11.4.2 NCBI Variation Services API

| Endpoint | Description |
|----------|-------------|
| `/variation/v0/spdi/` | SPDI notation conversion |
| `/variation/v0/hgvs/` | HGVS validation |
| `/variation/v0/refsnp/` | RefSNP data |

**Example:**
```
https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/1065852
```

#### 11.4.3 FTP Bulk Download

| File | URL | Format | Description |
|------|-----|--------|-------------|
| VCF (GRCh38) | `ftp.ncbi.nlm.nih.gov/snp/organisms/human_9606_b151_GRCh38p7/VCF/` | VCF | All RefSNPs |
| JSON RefSNP | `ftp.ncbi.nlm.nih.gov/snp/.redesign/latest_release/` | JSON | RefSNP reports |
| Frequency data | `ftp.ncbi.nlm.nih.gov/snp/population_frequency/` | TSV | ALFA frequencies |

#### 11.4.4 ALFA (Allele Frequency Aggregator)

| Feature | Details |
|---------|---------|
| URL | Integrated into dbSNP |
| Populations | 14 populations, 200,000+ samples |
| Allele frequencies | Genome-wide allele frequencies |
| Format | JSON via API, VCF via FTP |

### 11.5 dbSNP Build Information

| Build | Release Date | RefSNP Count | Notes |
|-------|-------------|--------------|-------|
| Build 151 | 2017 | ~650M | Major reorganization |
| Build 153 | 2019 | ~700M | SPDI normalization |
| Build 154 | 2020 | ~1.1B | Increased submissions |
| Build 155 | 2022 | ~1.5B | RefSeq gene updates |
| Build 156 | 2024 | ~1.8B | Latest |

### 11.6 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Build releases | Annually (approximately) |
| Web interface | Real-time |
| ALFA frequencies | Quarterly |
| E-utilities | Real-time |

### 11.7 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│                    DBSNP INTEGRATION                      │
├──────────────────────────────────────────────────────────┤
│ 1. Extract rsIDs from patient VCF or PGx panel           │
│                                                          │
│ 2. Query dbSNP for variant metadata                      │
│    → GET /variation/v0/refsnp/{rsID}                     │
│    → Chromosome, position, reference/alternate alleles   │
│                                                          │
│ 3. Retrieve allele frequencies from ALFA                 │
│    → Population-specific frequencies                     │
│                                                          │
│ 4. Cross-reference with ClinVar for clinical significance│
│    → Clinical interpretation                             │
│                                                          │
│ 5. Map to PharmVar for allele function                   │
│    → CYP450 allele definitions                           │
└──────────────────────────────────────────────────────────┘
```

### 11.8 Limitations

- **Duplicate rsIDs:** Some rsIDs may be merged or deprecated
- **Variant normalization:** VCF left-alignment vs. HGVS right-alignment
- **Sparse clinical data:** dbSNP is a reference database, not clinical
- **Population representation:** ALFA frequencies may not cover all populations
- **Structural variants:** Limited representation of CNVs and indels > 50bp
- **ClinVar overlap:** Clinical significance is in ClinVar, not dbSNP

---

## 12. 1000 Genomes

### 12.1 Overview

**Name:** 1000 Genomes Project
**Primary URL:** https://www.internationalgenome.org
**Data Portal:** http://www.internationalgenome.org/data
**FTP:** https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/
**Maintainer:** International Genome Sample Resource (IGSR)
**Phase:** 3 (final)
**Samples:** 2,504 individuals from 26 populations

### 12.2 Description

The 1000 Genomes Project created the largest public catalog of human genetic variation. Phase 3 provides population allele frequencies across diverse global populations, essential for:

- **Population allele frequencies:** Reference frequencies for PGx variants
- **Population stratification:** Differences in allele frequencies by ancestry
- **Rare variant discovery:** Identification of rare pharmacogenetic variants
- **Imputation reference:** Reference panel for genotype imputation
- **Haplotype structure:** Phased haplotypes for star allele calling

### 12.3 License

**License:** Open Access (no restrictions)
**Commercial Use:** Unrestricted
**Attribution Required:** Recommended
**Citation:** PMID: 26432245 (1000 Genomes Project Consortium, 2015)

### 12.4 Data Access Methods

#### 12.4.1 FTP Bulk Download

| File Type | URL Pattern | Format | Description |
|-----------|------------|--------|-------------|
| Phase 3 VCF | `/release/20130502/` | VCF (bgzipped) | All SNPs and indels |
| Phase 3 VCF (chr-specific) | `/release/20130502/` | VCF per chromosome | Chromosome-split |
| Phase 1 VCF | `/release/20110521/` | VCF | Earlier release |
| Alignment files | `/data/` | BAM/CRAM | Raw sequencing data |

**Base FTP URL:** `ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/`

#### 12.4.2 File Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| VCF | Variant Call Format | Genotype data, allele frequencies |
| BAM/CRAM | Aligned reads | Raw sequencing data |
| Panel files | Population ancestry | Population stratification |

#### 12.4.3 Populations

| Super Population | Populations | Sample Size |
|-----------------|-------------|-------------|
| AFR (African) | YRI, LWK, GWD, MSL, ESN, ASW, ACB | 661 |
| AMR (American) | MXL, PUR, CLM, PEL | 347 |
| EAS (East Asian) | CHB, JPT, CHS, CDX, KHV | 504 |
| EUR (European) | CEU, TSI, FIN, GBR, IBS | 503 |
| SAS (South Asian) | GIH, PJL, BEB, STU, ITU | 489 |

#### 12.4.4 IGSR Data Portal

| Feature | URL | Description |
|---------|-----|-------------|
| Sample browser | `/data-portal/sample` | Browse samples by population |
| Variant search | Data portal search | Search for specific variants |
| File browser | `/ftp-search` | Search FTP files |

### 12.5 Key PGx Allele Frequencies in 1000 Genomes

#### 12.5.1 CYP2D6 Key Variants

| Variant | rsID | AFR Freq | EUR Freq | EAS Freq | SAS Freq |
|---------|------|----------|----------|----------|----------|
| 100C>T (P34S) | rs1065852 | 0.06 | 0.72 | 0.49 | 0.31 |
| 1846G>A (splicing) | rs3892097 | 0.02 | 0.25 | 0.00 | 0.07 |
| 2549delA (frameshift) | rs35742686 | 0.03 | 0.02 | 0.00 | 0.02 |
| 2988G>A | rs28371725 | 0.82 | 0.04 | 0.03 | 0.06 |
| 1000C>T (R296C) | rs1065854 | 0.04 | 0.01 | 0.00 | 0.03 |

#### 12.5.2 CYP2C19 Key Variants

| Variant | rsID | AFR Freq | EUR Freq | EAS Freq | SAS Freq |
|---------|------|----------|----------|----------|----------|
| 681G>A (*2, splicing) | rs4244285 | 0.17 | 0.13 | 0.34 | 0.32 |
| 636G>A (*3, W212X) | rs4986893 | 0.00 | 0.00 | 0.11 | 0.01 |
| -806C>T (*17) | rs12248560 | 0.22 | 0.19 | 0.00 | 0.26 |

#### 12.5.3 CYP2C9 Key Variants

| Variant | rsID | AFR Freq | EUR Freq | EAS Freq | SAS Freq |
|---------|------|----------|----------|----------|----------|
| 430C>T (*2, R144C) | rs1799853 | 0.03 | 0.11 | 0.00 | 0.06 |
| 1075A>C (*3, I359L) | rs1057910 | 0.01 | 0.08 | 0.03 | 0.06 |

### 12.6 Update Frequency

| Update Type | Frequency |
|-------------|-----------|
| Phase 3 data | Static (final release 2015) |
| IGSR updates | Ongoing (new samples added) |
| Data portal | Continuous |

### 12.7 Integration Approach

```
┌──────────────────────────────────────────────────────────┐
│               1000 GENOMES INTEGRATION                    │
├──────────────────────────────────────────────────────────┤
│ 1. Download Phase 3 VCF for relevant chromosomes         │
│    → chr22 (CYP2D6), chr10 (CYP2C19), etc.               │
│                                                          │
│ 2. Extract allele frequencies by population              │
│    → Use bcftools to query specific positions            │
│                                                          │
│ 3. Compare patient genotype to population frequencies    │
│    → Identify rare vs. common variants                   │
│                                                          │
│ 4. Use as reference for population-specific              │
│    phenotype frequency estimation                        │
│                                                          │
│ 5. Cross-reference with PharmVar allele definitions      │
│    → Assign star alleles based on population data        │
└──────────────────────────────────────────────────────────┘
```

### 12.8 Limitations

- **Static data:** Phase 3 is complete; no new samples for this phase
- **Low coverage:** 4-6x whole genome sequencing (some variants may be missed)
- **No clinical data:** Only genetic data, no drug response phenotypes
- **Population representation:** Some populations underrepresented
- **Structural variants:** CYP2D6 CNVs not reliably called at low coverage
- **Phased data:** Phasing quality varies by region complexity
- **Build versions:** GRCh37 (original); liftover required for GRCh38

---

## 13. PharmGKB / ClinPGx API Code Examples

### 13.1 Python API Client

```python
#!/usr/bin/env python3
"""
ClinPGx (PharmGKB) API Client for Pharmacogenomics
DeepSynaps Protocol Studio
"""

import requests
import time
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from urllib.parse import urlencode


# ───────────────────────────────────────────────────────────────
# CONFIGURATION
# ───────────────────────────────────────────────────────────────

CLINPGX_BASE_URL = "https://api.clinpgx.org/v1"
RATE_LIMIT_DELAY = 0.5  # 2 requests per second = 0.5s delay


# ───────────────────────────────────────────────────────────────
# DATA CLASSES
# ───────────────────────────────────────────────────────────────

@dataclass
class ClinicalAnnotation:
    """Represents a ClinPGx clinical annotation."""
    id: str
    gene_symbol: str
    gene_pa_id: str
    drug_name: str
    drug_pa_id: str
    level_of_evidence: str
    annotation_text: str
    variant_count: int
    publication_count: int
    guideline_count: int
    drug_label_count: int
    
    @property
    def is_actionable(self) -> bool:
        """Check if annotation has clinical actionability."""
        return self.level_of_evidence in ['1A', '1B', '2A']


@dataclass
class GeneInfo:
    """Represents a gene entity from ClinPGx."""
    pa_id: str
    symbol: str
    name: str
    chromosomes: List[str]
    has_guidelines: bool


@dataclass
class DrugInfo:
    """Represents a drug/chemical entity from ClinPGx."""
    pa_id: str
    name: str
    generic_names: List[str]
    trade_names: List[str]
    drug_classes: List[str]


# ───────────────────────────────────────────────────────────────
# API CLIENT
# ───────────────────────────────────────────────────────────────

class ClinPGxClient:
    """
    ClinPGx API Client with rate limiting and error handling.
    
    Rate limit: 2 requests per second
    No authentication required
    """
    
    def __init__(self, base_url: str = CLINPGX_BASE_URL):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'DeepSynaps-PGxClient/1.0'
        })
        self._last_request_time = 0
    
    def _rate_limit(self):
        """Enforce rate limiting (2 req/sec)."""
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            time.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()
    
    def _request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """Make a rate-limited API request."""
        self._rate_limit()
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            response = self.session.get(url, params=params or {}, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if response.status_code == 429:
                time.sleep(2)
                return self._request(endpoint, params)
            elif response.status_code == 400:
                raise ValueError(f"Bad request: {url} - {response.text}")
            else:
                raise RuntimeError(f"API error {response.status_code}: {e}")
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Request failed: {e}")
    
    # ── Gene Operations ──────────────────────────────────────
    
    def search_genes(self, symbol: Optional[str] = None, 
                     name: Optional[str] = None,
                     view: str = "min") -> List[GeneInfo]:
        """
        Search for genes by symbol or name.
        
        Args:
            symbol: Gene symbol (e.g., 'CYP2D6')
            name: Gene full name
            view: Detail level ('min', 'base', 'max')
        
        Returns:
            List of GeneInfo objects
        """
        params = {"view": view}
        if symbol:
            params["symbol"] = symbol
        if name:
            params["name"] = name
        
        data = self._request("/data/gene", params)
        genes = data.get("data", []) if isinstance(data.get("data"), list) else []
        
        return [
            GeneInfo(
                pa_id=g.get("id", ""),
                symbol=g.get("symbol", ""),
                name=g.get("name", ""),
                chromosomes=g.get("chromosomes", []),
                has_guidelines=bool(g.get("hasGuidelines", False))
            )
            for g in genes
        ]
    
    def get_gene_details(self, gene_pa_id: str, 
                         view: str = "max") -> Dict[str, Any]:
        """
        Get detailed information about a specific gene.
        
        Args:
            gene_pa_id: PharmGKB/ClinPGx PA ID (e.g., 'PA128' for CYP2D6)
            view: Detail level ('min', 'base', 'max')
        
        Returns:
            Gene details as dictionary
        """
        return self._request(f"/data/gene/{gene_pa_id}", {"view": view})
    
    def get_gene_by_symbol(self, symbol: str) -> Optional[GeneInfo]:
        """
        Convenience method: look up gene by symbol.
        
        Args:
            symbol: Gene symbol (e.g., 'CYP2D6')
        
        Returns:
            GeneInfo or None if not found
        """
        genes = self.search_genes(symbol=symbol, view="min")
        return genes[0] if genes else None
    
    # ── Drug Operations ──────────────────────────────────────
    
    def search_drugs(self, name: Optional[str] = None,
                     view: str = "min") -> List[DrugInfo]:
        """
        Search for drugs/chemicals by name.
        
        Args:
            name: Drug name (e.g., 'sertraline')
            view: Detail level ('min', 'base', 'max')
        
        Returns:
            List of DrugInfo objects
        """
        params = {"view": view}
        if name:
            params["name"] = name
        
        data = self._request("/data/chemical", params)
        drugs = data.get("data", []) if isinstance(data.get("data"), list) else []
        
        return [
            DrugInfo(
                pa_id=d.get("id", ""),
                name=d.get("name", ""),
                generic_names=d.get("genericNames", []),
                trade_names=d.get("tradeNames", []),
                drug_classes=d.get("drugClasses", [])
            )
            for d in drugs
        ]
    
    # ── Clinical Annotation Operations ───────────────────────
    
    def get_clinical_annotation(self, annotation_id: str,
                                 view: str = "max") -> Dict[str, Any]:
        """
        Retrieve a specific clinical annotation by ID.
        
        Args:
            annotation_id: Clinical annotation ID (e.g., '1447954390')
            view: Detail level ('min', 'base', 'max')
        
        Returns:
            Clinical annotation data
        """
        return self._request(
            f"/data/clinicalAnnotation/{annotation_id}",
            {"view": view}
        )
    
    def get_guideline_annotation(self, guideline_id: str,
                                  view: str = "max") -> Dict[str, Any]:
        """
        Retrieve a CPIC/DPWG dosing guideline annotation.
        
        Args:
            guideline_id: Guideline annotation ID
            view: Detail level ('min', 'base', 'max')
        
        Returns:
            Guideline annotation data
        """
        return self._request(
            f"/data/guideline/{guideline_id}",
            {"view": view}
        )
    
    def get_pathway(self, pathway_id: str) -> Dict[str, Any]:
        """
        Retrieve a pharmacokinetic pathway.
        
        Args:
            pathway_id: Pathway ID
        
        Returns:
            Pathway data (BioPAX reference)
        """
        return self._request(f"/data/pathway/{pathway_id}", {"view": "max"})
    
    def close(self):
        """Close the HTTP session."""
        self.session.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# ───────────────────────────────────────────────────────────────
# USAGE EXAMPLES
# ───────────────────────────────────────────────────────────────

def example_gene_lookup():
    """Example: Look up CYP2D6 gene information."""
    with ClinPGxClient() as client:
        # Search for CYP2D6
        gene = client.get_gene_by_symbol("CYP2D6")
        if gene:
            print(f"Gene: {gene.symbol}")
            print(f"  PA ID: {gene.pa_id}")
            print(f"  Name: {gene.name}")
            print(f"  Chromosomes: {', '.join(gene.chromosomes)}")
            print(f"  Has Guidelines: {gene.has_guidelines}")
        else:
            print("Gene not found")


def example_drug_search():
    """Example: Search for sertraline."""
    with ClinPGxClient() as client:
        drugs = client.search_drugs(name="sertraline", view="base")
        for drug in drugs:
            print(f"Drug: {drug.name}")
            print(f"  PA ID: {drug.pa_id}")
            print(f"  Generic Names: {drug.generic_names}")
            print(f"  Trade Names: {drug.trade_names}")


def example_clinical_annotation():
    """Example: Retrieve a clinical annotation."""
    with ClinPGxClient() as client:
        # CYP2D6-codeine annotation (example ID)
        annotation = client.get_clinical_annotation("1447954390")
        print(json.dumps(annotation, indent=2))


# ───────────────────────────────────────────────────────────────
# BULK DATA DOWNLOAD
# ───────────────────────────────────────────────────────────────

def download_clinpgx_bulk_data(output_dir: str = "./clinpgx_data"):
    """
    Download all available ClinPGx bulk datasets.
    
    Args:
        output_dir: Directory to save downloaded files
    """
    import os
    import zipfile
    
    os.makedirs(output_dir, exist_ok=True)
    
    base_download_url = "https://api.clinpgx.org/v1/download/file/data"
    
    files = {
        "summaryAnnotations.zip": "Summary annotations",
        "variantAnnotations.zip": "Variant annotations",
        "relationships.zip": "Gene-drug relationships",
        "guidelineAnnotations.json.zip": "Guideline annotations (JSON)",
        "drugLabels.zip": "Drug label annotations",
        "clinicalVariants.zip": "Clinical variant data",
        "pathways-tsv.zip": "Pathways (TSV)",
        "genes.zip": "Gene reference data",
        "variants.zip": "Variant reference data"
    }
    
    session = requests.Session()
    
    for filename, description in files.items():
        url = f"{base_download_url}/{filename}"
        filepath = os.path.join(output_dir, filename)
        
        print(f"Downloading {description}...")
        try:
            response = session.get(url, timeout=60)
            response.raise_for_status()
            
            with open(filepath, 'wb') as f:
                f.write(response.content)
            
            # Extract if zip file
            if filename.endswith('.zip'):
                extract_dir = os.path.join(output_dir, filename.replace('.zip', ''))
                os.makedirs(extract_dir, exist_ok=True)
                with zipfile.ZipFile(filepath, 'r') as z:
                    z.extractall(extract_dir)
                print(f"  Extracted to {extract_dir}")
            
            print(f"  Saved: {filepath}")
        except Exception as e:
            print(f"  Error downloading {filename}: {e}")
        
        time.sleep(0.5)  # Rate limiting
    
    session.close()
    print(f"\nAll data downloaded to: {output_dir}")


if __name__ == "__main__":
    example_gene_lookup()
    print("\n" + "="*60 + "\n")
    example_drug_search()
```

### 13.2 JavaScript/TypeScript API Client

```typescript
/**
 * ClinPGx (PharmGKB) API Client - TypeScript
 * DeepSynaps Protocol Studio
 */

const CLINPGX_BASE_URL = 'https://api.clinpgx.org/v1';
const RATE_LIMIT_MS = 500; // 2 requests per second

interface GeneInfo {
  paId: string;
  symbol: string;
  name: string;
  chromosomes: string[];
  hasGuidelines: boolean;
}

interface DrugInfo {
  paId: string;
  name: string;
  genericNames: string[];
  tradeNames: string[];
}

interface ClinicalAnnotation {
  id: string;
  geneSymbol: string;
  drugName: string;
  levelOfEvidence: string;
  annotationText: string;
  isActionable: boolean;
}

class ClinPGxClient {
  private baseUrl: string;
  private lastRequestTime: number = 0;

  constructor(baseUrl: string = CLINPGX_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request(endpoint: string, params?: Record<string, string>): Promise<any> {
    await this.rateLimit();
    
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DeepSynaps-PGxClient/1.0'
      }
    });

    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      return this.request(endpoint, params);
    }

    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async searchGenes(symbol?: string, view: string = 'min'): Promise<GeneInfo[]> {
    const params: Record<string, string> = { view };
    if (symbol) params.symbol = symbol;
    
    const data = await this.request('/data/gene', params);
    const genes = Array.isArray(data.data) ? data.data : [];
    
    return genes.map((g: any) => ({
      paId: g.id || '',
      symbol: g.symbol || '',
      name: g.name || '',
      chromosomes: g.chromosomes || [],
      hasGuidelines: !!g.hasGuidelines
    }));
  }

  async getGeneBySymbol(symbol: string): Promise<GeneInfo | null> {
    const genes = await this.searchGenes(symbol, 'min');
    return genes[0] || null;
  }

  async searchDrugs(name: string, view: string = 'min'): Promise<DrugInfo[]> {
    const params: Record<string, string> = { view, name };
    const data = await this.request('/data/chemical', params);
    const drugs = Array.isArray(data.data) ? data.data : [];
    
    return drugs.map((d: any) => ({
      paId: d.id || '',
      name: d.name || '',
      genericNames: d.genericNames || [],
      tradeNames: d.tradeNames || []
    }));
  }

  async getClinicalAnnotation(annotationId: string, view: string = 'max'): Promise<any> {
    return this.request(`/data/clinicalAnnotation/${annotationId}`, { view });
  }

  async getGuidelineAnnotation(guidelineId: string, view: string = 'max'): Promise<any> {
    return this.request(`/data/guideline/${guidelineId}`, { view });
  }
}

// Usage
async function main() {
  const client = new ClinPGxClient();
  
  // Look up CYP2D6
  const gene = await client.getGeneBySymbol('CYP2D6');
  console.log('Gene:', gene);
  
  // Search for sertraline
  const drugs = await client.searchDrugs('sertraline');
  console.log('Drugs:', drugs);
}

// main();
```

### 13.3 curl Command Examples

```bash
#!/bin/bash
# ClinPGx API curl examples

BASE_URL="https://api.clinpgx.org/v1"

# 1. Search for CYP2D6 gene
echo "=== Gene Search ==="
curl -s "${BASE_URL}/data/gene?symbol=CYP2D6&view=min" | python3 -m json.tool

# 2. Get CYP2D6 gene details (PA128 is the CYP2D6 PA ID)
echo "=== Gene Details ==="
curl -s "${BASE_URL}/data/gene/PA128?view=max" | python3 -m json.tool

# 3. Search for sertraline drug
echo "=== Drug Search ==="
curl -s "${BASE_URL}/data/chemical?name=sertraline&view=min" | python3 -m json.tool

# 4. Get clinical annotation (replace with valid annotation ID)
echo "=== Clinical Annotation ==="
curl -s "${BASE_URL}/data/clinicalAnnotation/1447954390?view=max" | python3 -m json.tool

# 5. Get CPIC guideline annotation
echo "=== Guideline Annotation ==="
curl -s "${BASE_URL}/data/guideline/PA166251449?view=max" | python3 -m json.tool

# 6. Download bulk data
echo "=== Bulk Download ==="
curl -s "${BASE_URL}/download/file/data/clinicalVariants.zip" -o clinicalVariants.zip

# Rate limiting: wait 0.5 seconds between requests
sleep 0.5
```

---

## 14. CPIC Guidelines Parser

### 14.1 CPIC Allele Function Parser

```python
#!/usr/bin/env python3
"""
CPIC Guidelines Parser for Pharmacogenomics
Maps patient diplotypes to CPIC phenotypes and recommendations.
DeepSynaps Protocol Studio
"""

import json
import csv
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


# ───────────────────────────────────────────────────────────────
# ENUMS AND DATA CLASSES
# ───────────────────────────────────────────────────────────────

class MetabolizerStatus(str, Enum):
    """CPIC standardized metabolizer phenotypes."""
    ULTRARAPID = "Ultrarapid Metabolizer"
    NORMAL = "Normal Metabolizer"
    INTERMEDIATE = "Intermediate Metabolizer"
    POOR = "Poor Metabolizer"
    INDETERMINATE = "Indeterminate"
    UNKNOWN = "Unknown"


class FunctionCategory(str, Enum):
    """CPIC allele function categories."""
    NORMAL = "Normal Function"
    DECREASED = "Decreased Function"
    NO_FUNCTION = "No Function"
    INCREASED = "Increased Function"
    UNCERTAIN = "Uncertain Function"
    UNKNOWN = "Unknown"


@dataclass
class CpicAllele:
    """Represents a CPIC-defined star allele."""
    gene: str
    allele_name: str  # e.g., "*1", "*4", "*17"
    function: FunctionCategory
    activity_score: float
    defining_variants: List[str] = field(default_factory=list)  # rsIDs
    evidence_level: str = ""
    
    @property
    def is_no_function(self) -> bool:
        return self.function == FunctionCategory.NO_FUNCTION
    
    @property
    def is_decreased_function(self) -> bool:
        return self.function == FunctionCategory.DECREASED


@dataclass
class DiplotypeCall:
    """Represents a called diplotype (pair of alleles)."""
    gene: str
    allele1: str
    allele2: str
    activity_score: float
    metabolizer_status: MetabolizerStatus
    confidence: str = "high"  # high, medium, low
    
    def __str__(self) -> str:
        return f"{self.gene}: {self.allele1}/{self.allele2} " \
               f"(AS={self.activity_score}, {self.metabolizer_status.value})"


@dataclass
class DosingRecommendation:
    """CPIC dosing recommendation."""
    gene: str
    drug: str
    phenotype: MetabolizerStatus
    implication: str
    recommendation: str
    classification: str  # Strong, Moderate, Optional
    evidence_level: str  # A, B, C, D
    literature: List[str] = field(default_factory=list)


# ───────────────────────────────────────────────────────────────
# CYP2D6 PHENOTYPE ASSIGNMENT
# ───────────────────────────────────────────────────────────────

class CYP2D6PhenotypeAssigner:
    """
    Assign CYP2D6 phenotype based on CPIC activity score system.
    
    Activity Score Table:
    - *1, *2, *33, *35 = Normal (1.0 each)
    - *9, *10, *17, *29, *41 = Decreased (0.5 each)
    - *3, *4, *5, *6, *7, *8, *11-*16, *18-*21, *36-*38, *40, *42 = No function (0 each)
    - *1xN, *2xN = Increased (1.0 + N-1 copies)
    - *5 = Gene deletion (0)
    """
    
    ACTIVITY_SCORES = {
        # Normal function alleles (score = 1.0)
        "*1": 1.0, "*2": 1.0, "*33": 1.0, "*35": 1.0,
        # Decreased function alleles (score = 0.0 or 0.5)
        "*9": 0.0, "*10": 0.0, "*17": 0.0, "*29": 0.0, "*41": 0.0,
        # No function alleles (score = 0)
        "*3": 0.0, "*4": 0.0, "*5": 0.0, "*6": 0.0, "*7": 0.0,
        "*8": 0.0, "*11": 0.0, "*12": 0.0, "*13": 0.0, "*14": 0.0,
        "*15": 0.0, "*16": 0.0, "*18": 0.0, "*19": 0.0, "*20": 0.0,
        "*21": 0.0, "*36": 0.0, "*37": 0.0, "*38": 0.0, "*40": 0.0,
        "*42": 0.0, "*43": 0.0, "*44": 0.0, "*45": 0.0,
        # Increased function (handled separately for CNVs)
    }
    
    DECREASED_FUNCTION = {"*9", "*10", "*17", "*29", "*41"}
    
    @classmethod
    def parse_activity_score(cls, allele: str) -> float:
        """
        Parse activity score for a single allele.
        
        Args:
            allele: Star allele name (e.g., '*1', '*4', '*1x2')
        
        Returns:
            Activity score for the allele
        """
        # Handle gene duplications (e.g., *1xN)
        if 'x' in allele:
            base = allele.split('x')[0]
            try:
                copies = int(allele.split('x')[1])
            except ValueError:
                copies = 2  # Default to 2 if parsing fails
            base_score = cls.ACTIVITY_SCORES.get(base, 1.0)
            # For duplications: add (copies - 1) * base_score
            return base_score + (copies - 1) * base_score
        
        # Handle gene deletion
        if allele == "*5":
            return 0.0
        
        # Decreased function alleles (CPIC uses 0.0 for some, 0.5 for others)
        if allele in cls.DECREASED_FUNCTION:
            return 0.0  # Conservative: treat as no function for phenotype assignment
        
        return cls.ACTIVITY_SCORES.get(allele, 1.0)  # Default to 1.0 for unknown
    
    @classmethod
    def assign_phenotype(cls, diplotype: str) -> DiplotypeCall:
        """
        Assign CYP2D6 phenotype from diplotype string.
        
        Args:
            diplotype: Diplotype string (e.g., "*1/*4", "*4/*10")
        
        Returns:
            DiplotypeCall with phenotype assignment
        """
        alleles = diplotype.split('/')
        if len(alleles) != 2:
            raise ValueError(f"Invalid diplotype format: {diplotype}")
        
        allele1, allele2 = alleles[0].strip(), alleles[1].strip()
        
        # Calculate activity score
        score1 = cls.parse_activity_score(allele1)
        score2 = cls.parse_activity_score(allele2)
        total_score = score1 + score2
        
        # Assign phenotype based on activity score
        if total_score == 0:
            status = MetabolizerStatus.POOR
        elif 0 < total_score < 1.25:
            status = MetabolizerStatus.INTERMEDIATE
        elif 1.25 <= total_score <= 2.25:
            status = MetabolizerStatus.NORMAL
        elif total_score > 2.25:
            status = MetabolizerStatus.ULTRARAPID
        else:
            status = MetabolizerStatus.INDETERMINATE
        
        return DiplotypeCall(
            gene="CYP2D6",
            allele1=allele1,
            allele2=allele2,
            activity_score=total_score,
            metabolizer_status=status
        )


# ───────────────────────────────────────────────────────────────
# CYP2C19 PHENOTYPE ASSIGNMENT
# ───────────────────────────────────────────────────────────────

class CYP2C19PhenotypeAssigner:
    """
    Assign CYP2C19 phenotype based on CPIC activity score system.
    
    Activity Score Table:
    - *1, *2, *3 = Not applicable (CYP2C19 uses binary system)
    - CPIC uses function-based assignment rather than activity scores
    """
    
    NO_FUNCTION_ALLELES = {"*2", "*3", "*4", "*5", "*6", "*7", "*8"}
    DECREASED_FUNCTION_ALLELES = set()  # CYP2C19 uses binary model
    INCREASED_FUNCTION_ALLELES = {"*17"}
    
    @classmethod
    def assign_phenotype(cls, diplotype: str) -> DiplotypeCall:
        """
        Assign CYP2C19 phenotype from diplotype string.
        
        CPIC Binary Model:
        - Normal: Two normal function alleles (e.g., *1/*1)
        - Intermediate: One normal + one no function (e.g., *1/*2)
        - Poor: Two no function alleles (e.g., *2/*2)
        - Ultrarapid: One or two increased function alleles (e.g., *1/*17, *17/*17)
        """
        alleles = diplotype.split('/')
        if len(alleles) != 2:
            raise ValueError(f"Invalid diplotype format: {diplotype}")
        
        allele1, allele2 = alleles[0].strip(), alleles[1].strip()
        
        # Count no-function alleles
        no_func_count = sum(
            1 for a in [allele1, allele2] 
            if a in cls.NO_FUNCTION_ALLELES
        )
        
        # Count increased function alleles
        increased_count = sum(
            1 for a in [allele1, allele2] 
            if a in cls.INCREASED_FUNCTION_ALLELES
        )
        
        # Calculate activity score
        score1 = 0.0 if allele1 in cls.NO_FUNCTION_ALLELES else 1.0
        score2 = 0.0 if allele2 in cls.NO_FUNCTION_ALLELES else 1.0
        
        # Increased function overrides
        if allele1 in cls.INCREASED_FUNCTION_ALLELES:
            score1 = 1.5
        if allele2 in cls.INCREASED_FUNCTION_ALLELES:
            score2 = 1.5
        
        total_score = score1 + score2
        
        # Assign phenotype
        if no_func_count == 2:
            status = MetabolizerStatus.POOR
        elif no_func_count == 1 and increased_count == 0:
            status = MetabolizerStatus.INTERMEDIATE
        elif increased_count >= 1 and no_func_count == 0:
            status = MetabolizerStatus.ULTRARAPID
        elif increased_count == 1 and no_func_count == 1:
            status = MetabolizerStatus.INTERMEDIATE  # *17/*2 -> IM
        else:
            status = MetabolizerStatus.NORMAL
        
        return DiplotypeCall(
            gene="CYP2C19",
            allele1=allele1,
            allele2=allele2,
            activity_score=total_score,
            metabolizer_status=status
        )


# ───────────────────────────────────────────────────────────────
# CPIC GUIDELINE RECOMMENDATION LOOKUP
# ───────────────────────────────────────────────────────────────

class CpicGuidelineDatabase:
    """
    In-memory database of CPIC dosing recommendations.
    In production, load from CPIC JSON or database.
    """
    
    # Simplified CYP2D6 recommendations (from CPIC guidelines)
    CYP2D6_RECOMMENDATIONS = {
        "codeine": {
            MetabolizerStatus.ULTRARAPID: DosingRecommendation(
                gene="CYP2D6", drug="codeine",
                phenotype=MetabolizerStatus.ULTRARAPID,
                implication="Increased formation of morphine; risk of toxicity",
                recommendation="Avoid codeine use. Consider alternative analgesic.",
                classification="Strong",
                evidence_level="A"
            ),
            MetabolizerStatus.NORMAL: DosingRecommendation(
                gene="CYP2D6", drug="codeine",
                phenotype=MetabolizerStatus.NORMAL,
                implication="Normal morphine formation",
                recommendation="Use standard dosing. Monitor for efficacy.",
                classification="Strong",
                evidence_level="A"
            ),
            MetabolizerStatus.INTERMEDIATE: DosingRecommendation(
                gene="CYP2D6", drug="codeine",
                phenotype=MetabolizerStatus.INTERMEDIATE,
                implication="Reduced morphine formation; may have reduced efficacy",
                recommendation="Consider alternative analgesic (e.g., tramadol, morphine).",
                classification="Moderate",
                evidence_level="B"
            ),
            MetabolizerStatus.POOR: DosingRecommendation(
                gene="CYP2D6", drug="codeine",
                phenotype=MetabolizerStatus.POOR,
                implication="Greatly reduced morphine formation; lack of efficacy",
                recommendation="Avoid codeine. Use alternative analgesic (e.g., morphine).",
                classification="Strong",
                evidence_level="A"
            ),
        },
        "atomoxetine": {
            MetabolizerStatus.ULTRARAPID: DosingRecommendation(
                gene="CYP2D6", drug="atomoxetine",
                phenotype=MetabolizerStatus.ULTRARAPID,
                implication="Lower plasma concentrations; may require dose increase",
                recommendation="Consider dose increase. Monitor clinical response.",
                classification="Optional",
                evidence_level="B"
            ),
            MetabolizerStatus.NORMAL: DosingRecommendation(
                gene="CYP2D6", drug="atomoxetine",
                phenotype=MetabolizerStatus.NORMAL,
                implication="Normal metabolism",
                recommendation="Use standard dosing.",
                classification="Strong",
                evidence_level="A"
            ),
            MetabolizerStatus.INTERMEDIATE: DosingRecommendation(
                gene="CYP2D6", drug="atomoxetine",
                phenotype=MetabolizerStatus.INTERMEDIATE,
                implication="Higher plasma concentrations",
                recommendation="Standard dosing; monitor for adverse effects.",
                classification="Moderate",
                evidence_level="B"
            ),
            MetabolizerStatus.POOR: DosingRecommendation(
                gene="CYP2D6", drug="atomoxetine",
                phenotype=MetabolizerStatus.POOR,
                implication="Significantly higher plasma concentrations",
                recommendation="Consider dose reduction (50%). Monitor for adverse effects.",
                classification="Moderate",
                evidence_level="B"
            ),
        },
    }
    
    # CYP2C19 recommendations
    CYP2C19_RECOMMENDATIONS = {
        "clopidogrel": {
            MetabolizerStatus.NORMAL: DosingRecommendation(
                gene="CYP2C19", drug="clopidogrel",
                phenotype=MetabolizerStatus.NORMAL,
                implication="Normal clopidogrel activation",
                recommendation="Use standard dosing.",
                classification="Strong",
                evidence_level="A"
            ),
            MetabolizerStatus.INTERMEDIATE: DosingRecommendation(
                gene="CYP2C19", drug="clopidogrel",
                phenotype=MetabolizerStatus.INTERMEDIATE,
                implication="Reduced active metabolite formation",
                recommendation="Consider alternative antiplatelet (prasugrel, ticagrelor) if no contraindication.",
                classification="Moderate",
                evidence_level="B"
            ),
            MetabolizerStatus.POOR: DosingRecommendation(
                gene="CYP2C19", drug="clopidogrel",
                phenotype=MetabolizerStatus.POOR,
                implication="Very little active metabolite formation; high risk of treatment failure",
                recommendation="Use alternative antiplatelet (prasugrel or ticagrelor). Avoid clopidogrel.",
                classification="Strong",
                evidence_level="A"
            ),
        },
    }
    
    def __init__(self):
        self._db = {
            "CYP2D6": self.CYP2D6_RECOMMENDATIONS,
            "CYP2C19": self.CYP2C19_RECOMMENDATIONS,
        }
    
    def get_recommendation(self, gene: str, drug: str, 
                           phenotype: MetabolizerStatus) -> Optional[DosingRecommendation]:
        """
        Get CPIC dosing recommendation for a gene-drug-phenotype combination.
        
        Args:
            gene: Gene symbol (e.g., 'CYP2D6')
            drug: Drug name (e.g., 'codeine')
            phenotype: Metabolizer phenotype
        
        Returns:
            DosingRecommendation or None if no guideline exists
        """
        gene_db = self._db.get(gene.upper(), {})
        drug_db = gene_db.get(drug.lower(), {})
        return drug_db.get(phenotype)
    
    def list_guideline_drugs(self, gene: str) -> List[str]:
        """List drugs with CPIC guidelines for a given gene."""
        gene_db = self._db.get(gene.upper(), {})
        return list(gene_db.keys())


# ───────────────────────────────────────────────────────────────
# MAIN PHENOTYPE PARSER CLASS
# ───────────────────────────────────────────────────────────────

class CpicPhenotypeParser:
    """
    Main parser for CPIC phenotype assignment and dosing recommendations.
    """
    
    def __init__(self):
        self.cyp2d6_assigner = CYP2D6PhenotypeAssigner()
        self.cyp2c19_assigner = CYP2C19PhenotypeAssigner()
        self.guideline_db = CpicGuidelineDatabase()
    
    def assign_phenotype(self, gene: str, diplotype: str) -> DiplotypeCall:
        """
        Assign phenotype for any supported gene.
        
        Args:
            gene: Gene symbol (CYP2D6, CYP2C19, etc.)
            diplotype: Diplotype string (e.g., "*1/*4")
        
        Returns:
            DiplotypeCall with phenotype
        """
        gene = gene.upper()
        
        if gene == "CYP2D6":
            return self.cyp2d6_assigner.assign_phenotype(diplotype)
        elif gene == "CYP2C19":
            return self.cyp2c19_assigner.assign_phenotype(diplotype)
        else:
            raise ValueError(f"Gene {gene} not yet supported")
    
    def get_dosing_recommendation(self, gene: str, drug: str, 
                                   diplotype: str) -> Optional[DosingRecommendation]:
        """
        Get dosing recommendation for a patient.
        
        Args:
            gene: Gene symbol
            drug: Drug name
            diplotype: Patient diplotype
        
        Returns:
            DosingRecommendation or None
        """
        # First assign phenotype
        call = self.assign_phenotype(gene, diplotype)
        
        # Then look up recommendation
        return self.guideline_db.get_recommendation(gene, drug, call.metabolizer_status)
    
    def generate_report(self, patient_diplotypes: Dict[str, str],
                        patient_drugs: List[str]) -> Dict:
        """
        Generate a comprehensive PGx report for a patient.
        
        Args:
            patient_diplotypes: {gene: diplotype} mapping
            patient_drugs: List of current medications
        
        Returns:
            Report dictionary with phenotypes and recommendations
        """
        report = {
            "phenotypes": [],
            "recommendations": [],
            "no_guideline_drugs": [],
            "summary": {
                "actionable_findings": 0,
                "monitoring_recommended": 0,
                "alternatives_suggested": 0
            }
        }
        
        for gene, diplotype in patient_diplotypes.items():
            try:
                # Assign phenotype
                call = self.assign_phenotype(gene, diplotype)
                report["phenotypes"].append({
                    "gene": gene,
                    "diplotype": diplotype,
                    "activity_score": call.activity_score,
                    "phenotype": call.metabolizer_status.value,
                    "confidence": call.confidence
                })
                
                # Check each drug for guidelines
                for drug in patient_drugs:
                    rec = self.get_dosing_recommendation(gene, drug, diplotype)
                    if rec:
                        report["recommendations"].append({
                            "gene": gene,
                            "drug": drug,
                            "phenotype": rec.phenotype.value,
                            "implication": rec.implication,
                            "recommendation": rec.recommendation,
                            "classification": rec.classification,
                            "evidence": rec.evidence_level
                        })
                        
                        if rec.classification == "Strong":
                            report["summary"]["alternatives_suggested"] += 1
                        else:
                            report["summary"]["monitoring_recommended"] += 1
                    else:
                        report["no_guideline_drugs"].append(f"{drug} (no {gene} guideline)")
                        
            except ValueError as e:
                report["phenotypes"].append({
                    "gene": gene,
                    "diplotype": diplotype,
                    "error": str(e)
                })
        
        report["summary"]["actionable_findings"] = (
            report["summary"]["alternatives_suggested"] + 
            report["summary"]["monitoring_recommended"]
        )
        
        return report


# ───────────────────────────────────────────────────────────────
# USAGE EXAMPLES
# ───────────────────────────────────────────────────────────────

def example_phenotype_assignment():
    """Example: Assign phenotypes for common CYP2D6 diplotypes."""
    parser = CpicPhenotypeParser()
    
    test_diplotypes = [
        ("CYP2D6", "*1/*1"),
        ("CYP2D6", "*1/*4"),
        ("CYP2D6", "*4/*4"),
        ("CYP2D6", "*1/*10"),
        ("CYP2D6", "*10/*10"),
        ("CYP2D6", "*1/*1x2"),
        ("CYP2C19", "*1/*1"),
        ("CYP2C19", "*1/*2"),
        ("CYP2C19", "*2/*2"),
        ("CYP2C19", "*1/*17"),
    ]
    
    print("=" * 70)
    print("CPIC PHENOTYPE ASSIGNMENT EXAMPLES")
    print("=" * 70)
    
    for gene, diplotype in test_diplotypes:
        try:
            call = parser.assign_phenotype(gene, diplotype)
            print(f"{call}")
        except ValueError as e:
            print(f"{gene} {diplotype}: Error - {e}")


def example_dosing_recommendation():
    """Example: Get dosing recommendations."""
    parser = CpicPhenotypeParser()
    
    print("\n" + "=" * 70)
    print("CPIC DOSING RECOMMENDATION EXAMPLES")
    print("=" * 70)
    
    scenarios = [
        ("CYP2D6", "codeine", "*4/*4"),
        ("CYP2D6", "atomoxetine", "*4/*10"),
        ("CYP2C19", "clopidogrel", "*2/*2"),
    ]
    
    for gene, drug, diplotype in scenarios:
        rec = parser.get_dosing_recommendation(gene, drug, diplotype)
        if rec:
            print(f"\n{gene} {diplotype} + {drug}:")
            print(f"  Phenotype: {rec.phenotype.value}")
            print(f"  Implication: {rec.implication}")
            print(f"  Recommendation: {rec.recommendation}")
            print(f"  Classification: {rec.classification} (Evidence: {rec.evidence_level})")


def example_patient_report():
    """Example: Generate a patient PGx report."""
    parser = CpicPhenotypeParser()
    
    # Patient data
    diplotypes = {
        "CYP2D6": "*1/*4",
        "CYP2C19": "*1/*2"
    }
    
    medications = ["codeine", "sertraline", "clopidogrel", "warfarin"]
    
    report = parser.generate_report(diplotypes, medications)
    
    print("\n" + "=" * 70)
    print("PATIENT PHARMACOGENOMIC REPORT")
    print("=" * 70)
    
    print("\n--- Phenotypes ---")
    for pheno in report["phenotypes"]:
        print(f"  {pheno['gene']}: {pheno['diplotype']} -> {pheno['phenotype']}")
    
    print("\n--- Recommendations ---")
    for rec in report["recommendations"]:
        print(f"\n  {rec['drug']} (via {rec['gene']}):")
        print(f"    {rec['recommendation']}")
        print(f"    [Classification: {rec['classification']}, Evidence: {rec['evidence']}]")
    
    print("\n--- Summary ---")
    for key, value in report["summary"].items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    example_phenotype_assignment()
    example_dosing_recommendation()
    example_patient_report()
```

### 14.2 CPIC Allele Table Loader

```python
"""
Load CPIC allele definition tables from PharmVar or CPIC sources.
"""

import csv
from typing import Dict, List
from pathlib import Path


def load_cpic_allele_table(filepath: str) -> Dict[str, Dict]:
    """
    Load CPIC allele definition table from TSV/CSV file.
    
    Expected columns:
    - Gene, Allele, Function, Activity Score, rsIDs, Evidence Level
    
    Args:
        filepath: Path to allele definition file
    
    Returns:
        Dictionary of {allele_name: {gene, function, score, variants}}
    """
    alleles = {}
    
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            allele_name = row.get('Allele', '').strip()
            gene = row.get('Gene', '').strip()
            
            if allele_name and gene:
                key = f"{gene}:{allele_name}"
                alleles[key] = {
                    'gene': gene,
                    'allele': allele_name,
                    'function': row.get('Function', 'Unknown'),
                    'activity_score': float(row.get('Activity Value', '0') or 0),
                    'variants': row.get('Variant ID', '').split(';'),
                    'evidence': row.get('Evidence Level', '')
                }
    
    return alleles


def build_diplotype_from_variants(
    patient_variants: Dict[str, str],  # {rsID: genotype}
    allele_definitions: Dict[str, Dict]
) -> str:
    """
    Build diplotype from patient VCF variants and allele definitions.
    
    This is a simplified version; production requires:
    - Proper phasing (or phase inference)
    - Structural variant detection (CNVs)
    - Hybrid gene detection (CYP2D6/CYP2D7)
    
    Args:
        patient_variants: {rsID: "A/T"} genotype mapping
        allele_definitions: Loaded allele definitions
    
    Returns:
        Diplotype string (e.g., "*1/*4")
    """
    # This requires a proper star allele caller (e.g., Aldy, Stargazer)
    # Placeholder for integration point
    raise NotImplementedError(
        "Use a dedicated star allele caller (Aldy, Stargazer, "
        "or PyPGx) for production diplotype calling."
    )
```

---

## 15. FDA Labels Parser

### 15.1 openFDA Drug Label Query

```python
#!/usr/bin/env python3
"""
openFDA Drug Label Parser for Pharmacogenomics
Extracts PGx information from FDA drug labels.
DeepSynaps Protocol Studio
"""

import requests
import json
import time
from typing import Dict, List, Optional
from urllib.parse import quote


# ───────────────────────────────────────────────────────────────
# CONFIGURATION
# ───────────────────────────────────────────────────────────────

OPENFDA_BASE = "https://api.fda.gov/drug"
RATE_LIMIT_DELAY = 0.25  # 240 req/min without key

# PGx-related keywords for label text searching
PGX_KEYWORDS = [
    "CYP2D6", "CYP2C19", "CYP2C9", "CYP3A4", "CYP3A5",
    "CYP1A2", "CYP2B6", "SLCO1B1", "VKORC1", "TPMT",
    "UGT1A1", "HLA-B", "HLA-A", "DPYD", "NUDT15",
    "G6PD", "NAT2", "IFNL3", "IL28B",
    "poor metabolizer", "intermediate metabolizer",
    "ultrarapid metabolizer", "normal metabolizer",
    "extensive metabolizer", "genotype", "phenotype",
    "pharmacogenomic", "pharmacogenetic", "genetic test",
    "allele", "haplotype", "polymorphism", "wild type"
]


# ───────────────────────────────────────────────────────────────
# OPENFDA CLIENT
# ───────────────────────────────────────────────────────────────

class OpenFDAClient:
    """
    openFDA Drug Label API Client.
    
    Rate limits:
    - Without API key: 240 requests/minute, 1000/day
    - With API key: 600 requests/minute
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self._last_request = 0
    
    def _rate_limit(self):
        """Enforce rate limiting."""
        elapsed = time.time() - self._last_request
        if elapsed < RATE_LIMIT_DELAY:
            time.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request = time.time()
    
    def _request(self, endpoint: str, params: Dict) -> Dict:
        """Make rate-limited API request."""
        self._rate_limit()
        
        url = f"{OPENFDA_BASE}/{endpoint}"
        if self.api_key:
            params['api_key'] = self.api_key
        
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 404:
                return {"results": [], "meta": {"total": 0}}
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if response.status_code == 429:
                time.sleep(5)
                return self._request(endpoint, params)
            raise RuntimeError(f"openFDA error: {e}")
    
    def search_label(self, search_term: str, 
                     fields: Optional[List[str]] = None,
                     limit: int = 5) -> List[Dict]:
        """
        Search drug labels by term.
        
        Args:
            search_term: Search term (e.g., "openfda.brand_name:warfarin")
            fields: Specific SPL sections to return
            limit: Max results (max 1000)
        
        Returns:
            List of label records
        """
        params = {
            "search": search_term,
            "limit": min(limit, 1000)
        }
        
        data = self._request("label.json", params)
        return data.get("results", [])
    
    def get_drug_pgx_info(self, brand_name: str) -> Dict:
        """
        Get pharmacogenomic information for a specific drug.
        
        Args:
            brand_name: Brand name (e.g., "Plavix", "Coumadin")
        
        Returns:
            Dictionary with PGx information extracted from label
        """
        results = self.search_label(
            f'openfda.brand_name:"{brand_name}"',
            limit=1
        )
        
        if not results:
            return {"found": False, "drug": brand_name}
        
        label = results[0]
        
        # Extract PGx-relevant sections
        pgx_sections = {
            "pharmacogenomics": label.get("pharmacogenomics", []),
            "clinical_pharmacology": label.get("clinical_pharmacology", []),
            "warnings": label.get("warnings", []),
            "precautions": label.get("precautions", []),
            "dosage_and_administration": label.get("dosage_and_administration", []),
            "drug_interactions": label.get("drug_interactions", []),
            "use_in_specific_populations": label.get("use_in_specific_populations", []),
        }
        
        # Search for PGx keywords in all sections
        pgx_found = {}
        for section_name, section_text in pgx_sections.items():
            if not section_text:
                continue
            
            text = " ".join(section_text) if isinstance(section_text, list) else str(section_text)
            found_keywords = [kw for kw in PGX_KEYWORDS if kw.lower() in text.lower()]
            
            if found_keywords:
                pgx_found[section_name] = {
                    "keywords_found": list(set(found_keywords)),
                    "has_pgx_content": True
                }
        
        # Extract openfda harmonized fields
        openfda = label.get("openfda", {})
        
        return {
            "found": True,
            "drug": brand_name,
            "generic_name": openfda.get("generic_name", []),
            "brand_name": openfda.get("brand_name", []),
            "manufacturer": openfda.get("manufacturer_name", []),
            "rxcui": openfda.get("rxcui", []),
            "spl_set_id": openfda.get("spl_set_id", []),
            "pharm_classes": openfda.get("pharm_class_epc", []),
            "pgx_sections": pgx_found,
            "has_pgx_labeling": len(pgx_found) > 0,
            "label_date": label.get("effective_time", "unknown"),
            "set_id": label.get("set_id", "")
        }
    
    def count_pgx_labels(self) -> Dict:
        """
        Count drug labels containing pharmacogenomic information.
        
        Returns:
            Summary statistics of PGx labeling
        """
        pgx_counts = {}
        
        for keyword in ["CYP2D6", "CYP2C19", "CYP2C9", "genotype", "pharmacogenomic"]:
            data = self._request("label.json", {
                "search": f"{keyword}",
                "count": "openfda.brand_name.exact",
                "limit": 0
            })
            pgx_counts[keyword] = data.get("meta", {}).get("results", {}).get("total", 0)
            time.sleep(0.25)
        
        return pgx_counts
    
    def search_adverse_events(self, drug_name: str, 
                              pgx_related: bool = True) -> List[Dict]:
        """
        Search FAERS for adverse events related to a drug.
        
        Args:
            drug_name: Drug name
            pgx_related: Filter for PGx-related events
        
        Returns:
            List of adverse event records
        """
        search = f'patient.drug.medicinalproduct:"{drug_name}"'
        
        if pgx_related:
            search += " AND (reaction.reactionmeddrapt:(toxicity OR inefficacy OR " \
                     " Stevens-Johnson OR myopathy))"
        
        data = self._request("event.json", {
            "search": search,
            "limit": 100
        })
        
        return data.get("results", [])


# ───────────────────────────────────────────────────────────────
# PGx LABEL EXTRACTOR
# ───────────────────────────────────────────────────────────────

class PgxLabelExtractor:
    """Extract and summarize PGx information from FDA drug labels."""
    
    def __init__(self, client: OpenFDAClient):
        self.client = client
    
    def extract_pgx_summary(self, brand_names: List[str]) -> Dict:
        """
        Extract PGx summary for multiple drugs.
        
        Args:
            brand_names: List of brand names to check
        
        Returns:
            Summary report
        """
        report = {
            "drugs_checked": len(brand_names),
            "drugs_with_pgx": 0,
            "drugs_without_pgx": 0,
            "pgx_findings": []
        }
        
        for drug in brand_names:
            info = self.client.get_drug_pgx_info(drug)
            
            if info.get("has_pgx_labeling"):
                report["drugs_with_pgx"] += 1
                report["pgx_findings"].append(info)
            else:
                report["drugs_without_pgx"] += 1
        
        return report


# ───────────────────────────────────────────────────────────────
# USAGE EXAMPLES
# ───────────────────────────────────────────────────────────────

def example_drug_pgx_lookup():
    """Example: Look up PGx information for specific drugs."""
    client = OpenFDAClient()
    
    drugs = ["Plavix", "Coumadin", "Zoloft", "Clozaril", "Tegretol"]
    
    print("=" * 70)
    print("FDA DRUG LABEL PGx LOOKUP")
    print("=" * 70)
    
    for drug in drugs:
        print(f"\n--- {drug} ---")
        info = client.get_drug_pgx_info(drug)
        
        if info["found"]:
            print(f"  Generic: {info.get('generic_name', ['N/A'])}")
            print(f"  PGx Labeling: {'YES' if info['has_pgx_labeling'] else 'NO'}")
            
            if info["has_pgx_labeling"]:
                for section, content in info["pgx_sections"].items():
                    print(f"  Section [{section}]: {content['keywords_found']}")
        else:
            print("  Not found in openFDA")
        
        time.sleep(0.5)  # Rate limiting


def example_pgx_keyword_search():
    """Example: Search labels containing specific PGx keywords."""
    client = OpenFDAClient()
    
    # Search for drugs with CYP2D6 in label
    print("\n--- Drugs with CYP2D6 in label ---")
    results = client.search_label("CYP2D6", limit=10)
    
    for r in results[:5]:
        brand = r.get("openfda", {}).get("brand_name", ["Unknown"])
        generic = r.get("openfda", {}).get("generic_name", ["Unknown"])
        print(f"  {brand[0] if brand else 'N/A'} ({generic[0] if generic else 'N/A'})")


if __name__ == "__main__":
    example_drug_pgx_lookup()
    example_pgx_keyword_search()
```

### 15.2 Batch Label Processing

```python
"""
Batch process FDA drug labels for PGx content.
"""

import json
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor


def batch_check_pgx_labels(drug_list: List[str], 
                           client: OpenFDAClient,
                           max_workers: int = 4) -> Dict:
    """
    Check PGx labeling for a list of drugs in parallel.
    
    Args:
        drug_list: List of brand names
        client: OpenFDAClient instance
        max_workers: Number of parallel threads
    
    Returns:
        Summary dictionary
    """
    results = {
        "checked": 0,
        "with_pgx": 0,
        "without_pgx": 0,
        "not_found": 0,
        "pgx_drugs": [],
        "non_pgx_drugs": []
    }
    
    def check_drug(drug):
        try:
            info = client.get_drug_pgx_info(drug)
            return drug, info
        except Exception as e:
            return drug, {"found": False, "error": str(e)}
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(check_drug, d) for d in drug_list]
        
        for future in futures:
            drug, info = future.result()
            results["checked"] += 1
            
            if not info.get("found"):
                results["not_found"] += 1
            elif info.get("has_pgx_labeling"):
                results["with_pgx"] += 1
                results["pgx_drugs"].append(info)
            else:
                results["without_pgx"] += 1
                results["non_pgx_drugs"].append(drug)
    
    return results
```

---

## 16. VCF Parsing for PGx

### 16.1 VCF to PGx Variant Extractor

```python
#!/usr/bin/env python3
"""
VCF Parser for Pharmacogenomic Variants
Extracts PGx-relevant variants from patient VCF files.
DeepSynaps Protocol Studio
"""

import vcf  # PyVCF library
import cyvcf2  # Alternative: cyvcf2 for faster parsing
from typing import Dict, List, Optional, Tuple, Iterator
from dataclasses import dataclass, field
from pathlib import Path
import gzip


# ───────────────────────────────────────────────────────────────
# DATA CLASSES
# ───────────────────────────────────────────────────────────────

@dataclass
class PgxVariant:
    """Represents a pharmacogenomic variant call."""
    gene: str
    chrom: str
    pos: int
    ref: str
    alt: str
    rs_id: Optional[str]
    genotype: str  # e.g., "A/T", "0/1", "1/1"
    zygosity: str  # heterozygous, homozygous_ref, homozygous_alt, hemizygous
    quality: Optional[float]
    depth: Optional[int]
    
    # CPIC-specific fields
    star_allele: Optional[str] = None
    function: Optional[str] = None
    
    @property
    def is_homozygous_alt(self) -> bool:
        return self.zygosity == "homozygous_alt"
    
    @property
    def is_heterozygous(self) -> bool:
        return self.zygosity == "heterozygous"
    
    @property
    def has_alt_allele(self) -> bool:
        return self.zygosity in ("heterozygous", "homozygous_alt")


@dataclass
class PgxGeneResult:
    """Results for a single pharmacogene."""
    gene: str
    chrom: str
    variants: List[PgxVariant] = field(default_factory=list)
    diplotype: Optional[str] = None
    phenotype: Optional[str] = None
    activity_score: Optional[float] = None
    
    def get_variant_by_rsid(self, rs_id: str) -> Optional[PgxVariant]:
        """Find variant by rsID."""
        for v in self.variants:
            if v.rs_id == rs_id:
                return v
        return None


# ───────────────────────────────────────────────────────────────
# TARGET GENE DEFINITIONS
# ───────────────────────────────────────────────────────────────

# Psychiatric and neurological medication genes
PSYCHIATRIC_PGX_GENES = {
    "CYP2D6": {
        "chrom": "22",
        "start": 42126000,
        "end": 42133000,
        "variants": [
            "rs1065852",   # 100C>T, *4 defining
            "rs3892097",   # 1846G>A, *4 defining
            "rs28371706",  # 1707delT, *6 defining
            "rs5030865",   # 2935A>C, *7 defining
            "rs5030655",   # 1758G>T, *9 defining
            "rs1065854",   # 1000C>T, *10 defining
            "rs28371725",  # 2988G>A, *17 defining
        ],
        "drugs": ["codeine", "tramadol", "atomoxetine", "aripiprazole", 
                  "risperidone", "haloperidol", "metoprolol", "tamoxifen",
                  "nortriptyline", "amitriptyline"]
    },
    "CYP2C19": {
        "chrom": "10",
        "start": 94760000,
        "end": 94765000,
        "variants": [
            "rs4244285",   # 681G>A, *2 defining
            "rs4986893",   # 636G>A, *3 defining
            "rs28399504",  # 1A>G, *4 defining
            "rs41291556",  # 1297C>T, *5 defining
            "rs12248560",  # -806C>T, *17 defining
        ],
        "drugs": ["clopidogrel", "omeprazole", "esomeprazole", "lansoprazole",
                  "diazepam", "phenytoin", "sertraline", "citalopram",
                  "escitalopram", "amitriptyline", "clomipramine"]
    },
    "CYP2C9": {
        "chrom": "10",
        "start": 94930000,
        "end": 94940000,
        "variants": [
            "rs1799853",   # 430C>T, *2 defining
            "rs1057910",   # 1075A>C, *3 defining
            "rs9332131",   # 1076T>C, *5 defining
        ],
        "drugs": ["warfarin", "phenytoin", "losartan", "celecoxib",
                  "ibuprofen", "fluvastatin"]
    },
    "CYP3A4": {
        "chrom": "7",
        "start": 99745000,
        "end": 99758000,
        "variants": [
            "rs35599367",  # *22, intron 6
            "rs2740574",   # -392A>G, *1B
            "rs56324133",  # 153C>T, *2
        ],
        "drugs": ["tacrolimus", "cyclosporine", "fentanyl", "quetiapine",
                  "simvastatin", "atorvastatin", "midazolam"]
    },
    "CYP3A5": {
        "chrom": "7",
        "start": 99245000,
        "end": 99250000,
        "variants": [
            "rs776746",    # 6986A>G, *3 defining
            "rs10264272",  # 14690A>G, *6 defining
            "rs41303343",  # 27131-27132insT, *7 defining
        ],
        "drugs": ["tacrolimus", "cyclosporine", "midazolam"]
    },
    "CYP1A2": {
        "chrom": "15",
        "start": 75030000,
        "end": 75050000,
        "variants": [
            "rs762551",    # -163C>A, *1F defining
            "rs12720461",  # 5090C>T
        ],
        "drugs": ["clozapine", "olanzapine", "duloxetine", "theophylline",
                  "tizanidine", "caffeine"]
    },
    "CYP2B6": {
        "chrom": "19",
        "start": 40980000,
        "end": 41020000,
        "variants": [
            "rs3745274",   # 516G>T, *6 defining
            "rs2279343",   # 785A>G, *4 defining
            "rs28399499",  # 983T>C, *7 defining
            "rs3211371",   # 1459C>T, *5 defining
        ],
        "drugs": ["efavirenz", "bupropion", "methadone", "cyclophosphamide",
                  "ketamine"]
    },
    "SLCO1B1": {
        "chrom": "12",
        "start": 21330000,
        "end": 21340000,
        "variants": [
            "rs4149056",   # 388A>G, *1B defining
            "rs2306283",   # 463C>A
            "rs11045819",  # 521T>C, *5 defining
        ],
        "drugs": ["simvastatin", "atorvastatin", "pravastatin", "rosuvastatin"]
    },
    "VKORC1": {
        "chrom": "16",
        "start": 31050000,
        "end": 31055000,
        "variants": [
            "rs9923231",   # -1639G>A
            "rs9934438",   # 1173C>T
            "rs7294",      # 3730G>A
        ],
        "drugs": ["warfarin", "acenocoumarol", "phenprocoumon"]
    },
    "HLA-B": {
        "chrom": "6",
        "start": 31350000,
        "end": 31360000,
        "variants": [
            "rs2395029",   # Proxy for HLA-B*57:01
        ],
        "drugs": ["abacavir", "allopurinol", "carbamazepine", "phenytoin"]
    },
}

# All pharmacogenes for comprehensive testing
ALL_PGX_GENES = {
    **PSYCHIATRIC_PGX_GENES,
    "TPMT": {
        "chrom": "6",
        "start": 18130000,
        "end": 18155000,
        "variants": ["rs1800460", "rs1800462", "rs1142345"],
        "drugs": ["azathioprine", "6-mercaptopurine", "6-thioguanine"]
    },
    "DPYD": {
        "chrom": "1",
        "start": 97500000,
        "end": 97520000,
        "variants": ["rs3918290", "rs55886062", "rs75017182"],
        "drugs": ["5-fluorouracil", "capecitabine", "tegafur"]
    },
    "UGT1A1": {
        "chrom": "2",
        "start": 233700000,
        "end": 233800000,
        "variants": ["rs4148323", "rs887829", "rs3064744"],
        "drugs": ["irinotecan", "atazanavir", "nilotinib"]
    },
    "NUDT15": {
        "chrom": "13",
        "start": 48000000,
        "end": 48050000,
        "variants": ["rs116855232", "rs746071566", "rs186364861"],
        "drugs": ["azathioprine", "6-mercaptopurine"]
    },
    "G6PD": {
        "chrom": "X",
        "start": 154500000,
        "end": 154550000,
        "variants": ["rs1050828", "rs1050829", "rs5030868"],
        "drugs": ["primaquine", "dapsone", "nitrofurantoin", "rasburicase"]
    },
}


# ───────────────────────────────────────────────────────────────
# VCF PARSER
# ───────────────────────────────────────────────────────────────

class PgxVcfParser:
    """
    Parse pharmacogenomic variants from VCF files.
    Supports both PyVCF and cyvcf2 backends.
    """
    
    def __init__(self, target_genes: Optional[Dict] = None, 
                 use_cyvcf2: bool = False):
        """
        Initialize parser.
        
        Args:
            target_genes: Gene definitions (defaults to ALL_PGX_GENES)
            use_cyvcf2: Use cyvcf2 instead of PyVCF (faster)
        """
        self.target_genes = target_genes or ALL_PGX_GENES
        self.use_cyvcf2 = use_cyvcf2
    
    def is_in_gene(self, record, gene_name: str) -> bool:
        """
        Check if a VCF record falls within a target gene.
        
        Args:
            record: VCF record (PyVCF or cyvcf2)
            gene_name: Target gene name
        
        Returns:
            True if record is within gene region
        """
        gene_info = self.target_genes.get(gene_name)
        if not gene_info:
            return False
        
        chrom = str(record.CHROM).replace("chr", "")
        pos = record.POS
        
        return (chrom == gene_info["chrom"] and 
                gene_info["start"] <= pos <= gene_info["end"])
    
    def is_target_variant(self, record, gene_name: str) -> bool:
        """
        Check if a VCF record matches a known PGx variant.
        
        Args:
            record: VCF record
            gene_name: Target gene name
        
        Returns:
            True if variant is a known PGx variant
        """
        gene_info = self.target_genes.get(gene_name)
        if not gene_info:
            return False
        
        rs_id = str(record.ID) if record.ID else ""
        target_rsids = gene_info.get("variants", [])
        
        return rs_id in target_rsids
    
    def _parse_genotype(self, record, sample_name: str) -> Tuple[str, str]:
        """
        Parse genotype from VCF record.
        
        Returns:
            (genotype_string, zygosity)
        """
        try:
            if self.use_cyvcf2:
                gt_bases = record.genotypes[0]  # First sample
                gt_str = "/".join(gt_bases[:2])
                
                if gt_bases[2]:  # Phased
                    gt_str = "|".join(gt_bases[:2])
            else:
                call = record.genotype(sample_name)
                gt = call.gt_bases if hasattr(call, 'gt_bases') else "./."
                gt_str = str(gt) if gt else "./."
            
            # Determine zygosity
            alleles = gt_str.replace("|", "/").split("/")
            if len(alleles) == 2:
                if alleles[0] == alleles[1] == "0":
                    zygosity = "homozygous_ref"
                elif alleles[0] == alleles[1] == "1":
                    zygosity = "homozygous_alt"
                elif "0" in alleles and "1" in alleles:
                    zygosity = "heterozygous"
                else:
                    zygosity = "complex"
            else:
                zygosity = "unknown"
            
            return gt_str, zygosity
            
        except Exception:
            return "./.", "unknown"
    
    def parse_pgx_variants(self, vcf_path: str, 
                           sample_name: Optional[str] = None,
                           filter_by_rsids: bool = True) -> Dict[str, PgxGeneResult]:
        """
        Extract pharmacogenomic variants from a VCF file.
        
        Args:
            vcf_path: Path to VCF file (can be .gz)
            sample_name: Sample name in VCF (uses first if None)
            filter_by_rsids: Only extract known PGx variants
        
        Returns:
            Dictionary of {gene_name: PgxGeneResult}
        """
        results = {}
        
        # Initialize results for all target genes
        for gene_name, gene_info in self.target_genes.items():
            results[gene_name] = PgxGeneResult(
                gene=gene_name,
                chrom=gene_info["chrom"],
                variants=[]
            )
        
        # Open VCF
        if self.use_cyvcf2:
            reader = cyvcf2.VCF(vcf_path)
            sample_name = sample_name or reader.samples[0]
        else:
            reader = vcf.Reader(open(vcf_path, "rb") if vcf_path.endswith(".gz") 
                               else open(vcf_path, "r"))
            sample_name = sample_name or reader.samples[0]
        
        # Iterate through records
        for record in reader:
            for gene_name in self.target_genes:
                # Check if in gene region
                if not self.is_in_gene(record, gene_name):
                    continue
                
                # Check if target variant
                if filter_by_rsids and not self.is_target_variant(record, gene_name):
                    continue
                
                # Parse genotype
                gt_str, zygosity = self._parse_genotype(record, sample_name)
                
                # Skip reference homozygous for efficiency
                if zygosity == "homozygous_ref":
                    continue
                
                # Create variant
                variant = PgxVariant(
                    gene=gene_name,
                    chrom=str(record.CHROM).replace("chr", ""),
                    pos=record.POS,
                    ref=str(record.REF),
                    alt=str(record.ALT[0]) if record.ALT else "",
                    rs_id=str(record.ID) if record.ID else None,
                    genotype=gt_str,
                    zygosity=zygosity,
                    quality=getattr(record, 'QUAL', None),
                    depth=getattr(record, 'INFO', {}).get('DP') if not self.use_cyvcf2 else None
                )
                
                results[gene_name].variants.append(variant)
        
        if not self.use_cyvcf2:
            reader.reader.close() if hasattr(reader, 'reader') else None
        
        return results
    
    def parse_whole_genome(self, vcf_path: str,
                           chromosome: Optional[str] = None) -> Iterator[PgxVariant]:
        """
        Parse whole genome VCF for PGx variants.
        More efficient for large VCFs by chromosome filtering.
        
        Args:
            vcf_path: Path to whole genome VCF
            chromosome: Filter to specific chromosome (e.g., "22")
        
        Yields:
            PgxVariant objects
        """
        target_chroms = set(g["chrom"] for g in self.target_genes.values())
        
        reader = vcf.Reader(
            open(vcf_path, "rb") if vcf_path.endswith(".gz") else open(vcf_path, "r")
        )
        
        for record in reader:
            chrom = str(record.CHROM).replace("chr", "")
            
            # Chromosome filter
            if chromosome and chrom != chromosome:
                continue
            
            # Check if in any target gene
            for gene_name, gene_info in self.target_genes.items():
                if (chrom == gene_info["chrom"] and 
                    gene_info["start"] <= record.POS <= gene_info["end"]):
                    
                    gt_str, zygosity = self._parse_genotype(record, reader.samples[0])
                    
                    yield PgxVariant(
                        gene=gene_name,
                        chrom=chrom,
                        pos=record.POS,
                        ref=str(record.REF),
                        alt=str(record.ALT[0]) if record.ALT else "",
                        rs_id=str(record.ID) if record.ID else None,
                        genotype=gt_str,
                        zygosity=zygosity,
                        quality=getattr(record, 'QUAL', None),
                        depth=None
                    )


# ───────────────────────────────────────────────────────────────
# GENE-DRUG MATCHING
# ───────────────────────────────────────────────────────────────

def match_patient_drugs_to_genes(
    patient_drugs: List[str],
    gene_results: Dict[str, PgxGeneResult]
) -> List[Dict]:
    """
    Match patient's current medications to relevant PGx genes.
    
    Args:
        patient_drugs: List of drug names
        gene_results: Parsed PGx gene results
    
    Returns:
        List of gene-drug matches with variants found
    """
    matches = []
    
    for gene_name, result in gene_results.items():
        gene_info = ALL_PGX_GENES.get(gene_name, {})
        gene_drugs = [d.lower() for d in gene_info.get("drugs", [])]
        
        for drug in patient_drugs:
            if drug.lower() in gene_drugs:
                matches.append({
                    "drug": drug,
                    "gene": gene_name,
                    "variants_found": len(result.variants),
                    "has_actionable_variant": any(
                        v.has_alt_allele for v in result.variants
                    ),
                    "chromosome": result.chrom
                })
    
    return matches


# ───────────────────────────────────────────────────────────────
# USAGE EXAMPLES
# ───────────────────────────────────────────────────────────────

def example_parse_vcf():
    """Example: Parse PGx variants from VCF."""
    parser = PgxVcfParser(target_genes=ALL_PGX_GENES)
    
    # Parse a sample VCF
    # results = parser.parse_pgx_variants("patient.vcf.gz")
    
    # Print results
    # for gene, result in results.items():
    #     if result.variants:
    #         print(f"\n{gene}: {len(result.variants)} variants")
    #         for v in result.variants:
    #             print(f"  {v.rs_id}: {v.genotype} ({v.zygosity})")
    pass


if __name__ == "__main__":
    example_parse_vcf()
```

### 16.2 cyvcf2 Fast Parser (Production)

```python
"""
High-performance PGx VCF parser using cyvcf2.
Recommended for production use with large VCF files.
"""

import cyvcf2
from typing import Dict, List, Iterator, Set


def fast_parse_pgx_variants(vcf_path: str, 
                             target_positions: Dict[str, List[int]],
                             sample_idx: int = 0) -> Iterator[Dict]:
    """
    Fast PGx variant extraction using cyvcf2.
    
    Args:
        vcf_path: Path to VCF/BCF file
        target_positions: {chrom: [pos1, pos2, ...]} 
        sample_idx: Sample index in VCF
    
    Yields:
        Variant dictionaries
    """
    vcf = cyvcf2.VCF(vcf_path)
    
    # Build position lookup
    pos_lookup: Dict[str, Set[int]] = {}
    for chrom, positions in target_positions.items():
        chrom_clean = chrom.replace("chr", "")
        pos_lookup[chrom_clean] = set(positions)
    
    for variant in vcf:
        chrom = str(variant.CHROM).replace("chr", "")
        
        # Quick position check
        if chrom in pos_lookup and variant.POS in pos_lookup[chrom]:
            gt = variant.genotypes[sample_idx]
            gt_str = f"{gt[0]}/{gt[1]}"
            
            yield {
                "chrom": chrom,
                "pos": variant.POS,
                "ref": variant.REF,
                "alt": str(variant.ALT[0]) if variant.ALT else "",
                "rs_id": variant.ID or "",
                "genotype": gt_str,
                "phased": gt[2],
                "qual": variant.QUAL,
                "dp": variant.INFO.get("DP")
            }
    
    vcf.close()


# Example: Pre-built position lists for key genes
CYP2D6_POSITIONS = [
    42130692,  # rs1065852
    42128945,  # rs3892097
    # Add more positions as needed
]

CYP2C19_POSITIONS = [
    94781859,  # rs4244285
    94780653,  # rs4986893
    # Add more positions as needed
]
```

---

## 17. Integration Architecture

### 17.1 Complete Data Flow

```
================================================================================
                    DEEP SYNAPS PGx INTEGRATION PIPELINE
================================================================================

  INPUT LAYER                    PARSING LAYER              ANNOTATION LAYER
  ───────────                    ─────────────              ────────────────
  
  Patient VCF File    ────┐
  (Whole Genome or    │    │     ┌──────────────────┐      ┌──────────────┐
   Targeted Panel)    │    └───▶│  VCF Parser      │─────▶│  Variant     │
                      │         │  (PyVCF/cyvcf2)  │      │  Normalizer  │
  Patient Medications │         └──────────────────┘      └──────┬───────┘
  (EHR RxNorm codes)  │                                          │
                      │         ┌──────────────────┐             │
                      ├────────▶│  RxNorm Resolver │             │
                      │         │  (NLM API)       │             │
                      │         └──────────────────┘             │
                      │                                          ▼
                      │         ┌──────────────────┐      ┌──────────────┐
                      │         │  PharmVar        │◀─────│  dbSNP       │
                      ├────────▶│  Allele Caller   │      │  (rsID xref) │
                      │         │  (Star Alleles)  │      └──────────────┘
                      │         └──────────────────┘
                      │                                          │
                      │                                          ▼
                      │         ┌──────────────────┐      ┌──────────────┐
                      │         │  CPIC Phenotype  │◀─────│  Diplotype   │
                      └────────▶│  Assignment      │      │  Caller      │
                                │  (Activity Score)│      │  (Aldy/PyPGx)│
                                └──────────────────┘      └──────────────┘
                                           │
                                           ▼
RECOMMENDATION LAYER              EVIDENCE LAYER              OUTPUT LAYER
────────────────────              ──────────────              ────────────
                                           │
  ┌──────────────────┐                     │
  │  CPIC Dosing     │◀────────────────────┘
  │  Recommendations │              ┌──────────────────┐
  │  (ClinPGx/CPIC)  │◀────────────│  ClinVar         │
  └──────────────────┘             │  (Clinical       │
           │                       │  Significance)   │
           │                       └──────────────────┘
           │                                │
           ▼                                ▼
  ┌──────────────────┐              ┌──────────────────┐
  │  FDA Label       │◀─────────────│  FDA Biomarkers  │
  │  Cross-ref       │              │  Table           │
  │  (openFDA)       │              └──────────────────┘
  └──────────────────┘
           │
           ▼
  ┌──────────────────┐              ┌──────────────────┐
  │  Evidence        │─────────────▶│  Report          │
  │  Aggregator      │              │  Generator       │
  │  (Scoring)       │              │  (PDF/HTML)      │
  └──────────────────┘              └──────────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  Clinician   │
                                    │  Dashboard   │
                                    └──────────────┘
```

### 17.2 Data Flow Description

#### Step 1: VCF Upload and Parsing
```
Input: Patient VCF file (GRCh37 or GRCh38)
Action: Parse variants, normalize to GRCh38 if needed
Tools: PyVCF, cyvcf2, bcftools
Output: List of patient variants with genotypes
```

#### Step 2: Variant-to-Gene Mapping
```
Input: Patient variants
Action: Map variants to pharmacogenes using genomic coordinates
Tools: Custom gene definitions (from PharmVar), BED files
Sources: dbSNP (rsID mapping), ClinVar (clinical significance)
Output: Gene-specific variant lists
```

#### Step 3: Star Allele Calling
```
Input: Gene-specific variant lists
Action: Call star alleles from variant combinations
Tools: Aldy, Stargazer, PyPGx, or custom caller
Sources: PharmVar allele definitions
Output: Diplotype calls (e.g., CYP2D6: *1/*4)
```

#### Step 4: CPIC Phenotype Assignment
```
Input: Diplotype calls
Action: Assign metabolizer phenotype via activity scores
Tools: CPIC phenotype assignment rules
Sources: CPIC guidelines, PharmVar function annotations
Output: Phenotypes (e.g., CYP2D6: Intermediate Metabolizer)
```

#### Step 5: Drug-Phenotype Interaction Lookup
```
Input: Patient phenotypes + medication list
Action: Query CPIC dosing guidelines
Tools: ClinPGx API, CPIC recommendation tables
Sources: CPIC guidelines, PharmGKB clinical annotations
Output: Drug-specific recommendations
```

#### Step 6: FDA Label Check
```
Input: Patient medications
Action: Check FDA labels for PGx information
Tools: openFDA API
Sources: FDA drug labels, FDA biomarkers table
Output: FDA labeling status for each drug
```

#### Step 7: Evidence Aggregation
```
Input: All findings from Steps 1-6
Action: Aggregate evidence, assign confidence scores
Tools: Evidence scoring algorithm
Sources: ClinVar (star ratings), ClinPGx (evidence levels)
Output: Scored recommendations with evidence levels
```

#### Step 8: Report Generation
```
Input: Scored recommendations
Action: Generate clinician-facing report
Tools: Report generator (HTML/PDF)
Output: Final PGx report
```

### 17.3 Microservices Architecture

```python
"""
Microservices architecture for PGx pipeline.
Each service can be deployed independently.
"""

# Service 1: VCF Ingestion Service
"""
Responsibilities:
- Accept VCF file uploads
- Validate VCF format and genome build
- Normalize coordinates to GRCh38
- Store parsed variants

Endpoints:
POST /api/v1/vcf/upload
GET  /api/v1/vcf/{sample_id}/variants
GET  /api/v1/vcf/{sample_id}/status
"""

# Service 2: Genotype Calling Service
"""
Responsibilities:
- Call star alleles from VCF variants
- Use PharmVar allele definitions
- Generate diplotype calls
- Assign confidence scores

Endpoints:
POST /api/v1/genotype/call
GET  /api/v1/genotype/{sample_id}/diplotypes
GET  /api/v1/genotype/{sample_id}/quality
"""

# Service 3: Phenotype Service
"""
Responsibilities:
- Assign CPIC phenotypes from diplotypes
- Calculate activity scores
- Map to CPIC categories

Endpoints:
POST /api/v1/phenotype/assign
GET  /api/v1/phenotype/{sample_id}/phenotypes
"""

# Service 4: Drug Interaction Service
"""
Responsibilities:
- Look up CPIC dosing guidelines
- Query PharmGKB clinical annotations
- Check FDA drug labels

Endpoints:
POST /api/v1/interactions/check
GET  /api/v1/interactions/{sample_id}/recommendations
"""

# Service 5: Evidence Service
"""
Responsibilities:
- Aggregate evidence from multiple sources
- Query ClinVar for variant significance
- Score recommendations

Endpoints:
POST /api/v1/evidence/aggregate
GET  /api/v1/evidence/{sample_id}/scores
"""

# Service 6: Report Service
"""
Responsibilities:
- Generate clinician-facing reports
- Format as PDF/HTML
- Include evidence citations

Endpoints:
POST /api/v1/reports/generate
GET  /api/v1/reports/{report_id}
GET  /api/v1/reports/{report_id}/download
"""
```

### 17.4 Database Schema

```sql
-- Core tables for PGx data storage

-- Patient samples
CREATE TABLE samples (
    sample_id UUID PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    vcf_path VARCHAR(500),
    genome_build VARCHAR(10) DEFAULT 'GRCh38',
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending'
);

-- Called diplotypes
CREATE TABLE diplotypes (
    id SERIAL PRIMARY KEY,
    sample_id UUID REFERENCES samples(sample_id),
    gene VARCHAR(20) NOT NULL,
    allele1 VARCHAR(20) NOT NULL,
    allele2 VARCHAR(20) NOT NULL,
    activity_score DECIMAL(3,1),
    phenotype VARCHAR(50),
    confidence VARCHAR(20),
    called_at TIMESTAMP DEFAULT NOW()
);

-- Drug-gene interactions
CREATE TABLE drug_interactions (
    id SERIAL PRIMARY KEY,
    gene VARCHAR(20) NOT NULL,
    drug_name VARCHAR(100) NOT NULL,
    drug_class VARCHAR(100),
    has_cpic_guideline BOOLEAN DEFAULT FALSE,
    has_fda_labeling BOOLEAN DEFAULT FALSE,
    severity VARCHAR(20),  -- high, moderate, low
    UNIQUE(gene, drug_name)
);

-- Recommendations
CREATE TABLE recommendations (
    id SERIAL PRIMARY KEY,
    sample_id UUID REFERENCES samples(sample_id),
    gene VARCHAR(20) NOT NULL,
    drug_name VARCHAR(100) NOT NULL,
    phenotype VARCHAR(50),
    implication TEXT,
    recommendation TEXT,
    classification VARCHAR(20),  -- Strong, Moderate, Optional
    evidence_level VARCHAR(5),   -- A, B, C, D
    sources JSONB,               -- {clinpgx_id, cpic_guideline, fda_label}
    generated_at TIMESTAMP DEFAULT NOW()
);

-- Evidence scores
CREATE TABLE evidence_scores (
    id SERIAL PRIMARY KEY,
    recommendation_id INT REFERENCES recommendations(id),
    clinvar_stars INT,           -- 0-4
    clinpgx_level VARCHAR(5),    -- 1A, 1B, 2A, 2B, 3, 4
    fda_label_present BOOLEAN,
    guideline_count INT DEFAULT 0,
    publication_count INT DEFAULT 0,
    total_score DECIMAL(5,2)
);
```

### 17.5 API Gateway Specification

```yaml
openapi: 3.0.0
info:
  title: DeepSynaps PGx API
  version: 1.0.0
paths:
  /api/v1/analyze:
    post:
      summary: Submit VCF for PGx analysis
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                vcf_file:
                  type: string
                  format: binary
                medications:
                  type: array
                  items:
                    type: string
                genome_build:
                  type: string
                  enum: [GRCh37, GRCh38]
      responses:
        202:
          description: Analysis accepted
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                  status:
                    type: string
                    enum: [pending, processing, complete, error]
  
  /api/v1/results/{job_id}:
    get:
      summary: Get analysis results
      responses:
        200:
          description: Analysis complete
          content:
            application/json:
              schema:
                type: object
                properties:
                  phenotypes:
                    type: array
                    items:
                      type: object
                      properties:
                        gene: {type: string}
                        diplotype: {type: string}
                        phenotype: {type: string}
                        activity_score: {type: number}
                  recommendations:
                    type: array
                    items:
                      type: object
                      properties:
                        gene: {type: string}
                        drug: {type: string}
                        recommendation: {type: string}
                        classification: {type: string}
                        evidence: {type: string}
                  fda_alerts:
                    type: array
                    items:
                      type: object
                      properties:
                        drug: {type: string}
                        section: {type: string}
                        alert_text: {type: string}
```

### 17.6 Error Handling and Edge Cases

| Scenario | Handling |
|----------|----------|
| CYP2D6 structural variant | Use Aldy/PyPGx for CNV detection |
| No-call variant | Report as indeterminate; do not impute |
| Novel variant not in CPIC | Map to ClinVar; assign VUS |
| Missing medication list | Flag for manual medication review |
| Inconsistent guidelines | Report all; highlight conflicts |
| Low-quality VCF | Set confidence to low; recommend re-testing |
| HLA typing needed | Use imputation or specific HLA assay |
| Multi-allelic CYP2D6 | Use specialized caller; report ambiguity |
| Phased vs. unphased | Use phasing if available; report phasing status |

### 17.7 Quality Control Checklist

```python
QUALITY_CHECKS = {
    "vcf_validation": [
        "Check VCF format version (4.1+)",
        "Verify reference genome build",
        "Validate sample names",
        "Check for required INFO fields",
        "Verify genotype quality scores",
    ],
    "variant_quality": [
        "Minimum depth >= 20x for key positions",
        "Genotype quality (GQ) >= 30",
        "Allele balance 0.2-0.8 for heterozygotes",
        "Check for strand bias",
        "Verify variant normalization",
    ],
    "coverage_assessment": [
        "Full CYP2D6 gene coverage",
        "CYP2C19 exon coverage",
        "Key regulatory region coverage",
        "CNV detection coverage",
    ],
    "phenotype_validation": [
        "Activity score range validation",
        "Diplotype combination validation",
        "Cross-check with population frequencies",
        "Flag rare/unexpected phenotypes",
    ],
    "report_validation": [
        "All recommendations cite sources",
        "Evidence levels assigned",
        "FDA labeling cross-checked",
        "Confidence scores included",
        "Disclaimer text present",
    ]
}
```

---

## 18. Appendix: Evidence Grading

### 18.1 Evidence Level Framework

| Grade | Description | Data Requirements | Clinical Action |
|-------|-------------|-------------------|-----------------|
| **A** | Systematic review/meta-analysis | Multiple RCTs or high-quality observational studies | Strong recommendation |
| **B** | Moderate evidence | Limited RCTs or strong observational studies | Moderate recommendation |
| **C** | Emerging evidence | Single studies or weak associations | Consider in context |
| **D** | Expert opinion | No direct evidence; extrapolation | Optional/individualized |

### 18.2 CPIC vs. PharmGKB Evidence Integration

| CPIC Classification | PharmGKB Level | Combined Evidence |
|--------------------|----------------|-------------------|
| Strong + Evidence A | 1A | **Grade A** - Implement |
| Strong + Evidence B | 1B/2A | **Grade B** - Recommend |
| Moderate + Evidence B | 2A/2B | **Grade B** - Consider |
| Moderate + Evidence C | 3 | **Grade C** - Optional |
| Optional + Any | 3/4 | **Grade D** - Research only |

---

## 19. Appendix: CYP450 Reference Table

### 19.1 CYP450 Enzyme Characteristics

| Enzyme | Gene | Chromosome | Substrates | Inducers | Inhibitors |
|--------|------|-----------|-----------|----------|-----------|
| CYP1A2 | CYP1A2 | 15q24.1 | Clozapine, olanzapine, caffeine, theophylline | Smoking, chargrilled food, omeprazole | Fluvoxamine, ciprofloxacin |
| CYP2B6 | CYP2B6 | 19q13.2 | Bupropion, efavirenz, methadone, cyclophosphamide | Rifampin, carbamazepine | Ticlopidine, clopidogrel |
| CYP2C9 | CYP2C9 | 10q24.2 | Warfarin, phenytoin, losartan, celecoxib | Rifampin, carbamazepine | Fluconazole, amiodarone |
| CYP2C19 | CYP2C19 | 10q24.1 | Clopidogrel, omeprazole, diazepam, sertraline | Rifampin, St. John's wort | Fluconazole, fluvoxamine, omeprazole |
| CYP2D6 | CYP2D6 | 22q13.2 | Codeine, tramadol, atomoxetine, risperidone, metoprolol | Rare | Fluoxetine, paroxetine, bupropion, quinidine |
| CYP3A4 | CYP3A4 | 7q22.1 | Simvastatin, fentanyl, quetiapine, midazolam | Rifampin, carbamazepine, phenytoin, St. John's wort | Ketoconazole, itraconazole, ritonavir, grapefruit |
| CYP3A5 | CYP3A5 | 7q22.1 | Tacrolimus, cyclosporine, midazolam | Same as CYP3A4 | Same as CYP3A4 |

### 19.2 CYP450 Fetal and Developmental Expression

| Enzyme | Fetal Expression | Adult Expression | Developmental Note |
|--------|-----------------|------------------|-------------------|
| CYP1A2 | Minimal | High (smoking induces) | Adult levels by 1-2 years |
| CYP2B6 | Low | Moderate | Increases in first months |
| CYP2C9 | Moderate | High | Adult levels by 1 year |
| CYP2C19 | Low | Moderate | Variable; adult by 2 years |
| CYP2D6 | Low-moderate | High | Adult levels by ~1 year |
| CYP3A4/5 | Low at birth | High | Rapid increase in first week |

---

## 20. Appendix: Psychiatric Medication PGx Genes

### 20.1 Antidepressants

| Drug Class | Examples | Primary Gene | Secondary Genes | CPIC Guideline |
|-----------|----------|-------------|----------------|---------------|
| SSRIs | Sertraline, citalopram, escitalopram | CYP2C19 | CYP2D6 | Yes (CYP2C19) |
| SSRIs | Fluoxetine, paroxetine | CYP2D6 | CYP2B6 | Partial |
| SNRIs | Venlafaxine, desvenlafaxine | CYP2D6 | - | No |
| SNRIs | Duloxetine | CYP1A2, CYP2D6 | - | No |
| TCAs | Amitriptyline, nortriptyline, imipramine | CYP2D6 | CYP2C19 | Yes |
| Atypical | Vortioxetine | CYP2D6 | - | No |
| Atypical | Bupropion | CYP2B6 | - | No |

### 20.2 Antipsychotics

| Drug | Primary Gene | Secondary Genes | Metabolic Impact |
|------|-------------|----------------|-----------------|
| Clozapine | CYP1A2, CYP3A4, CYP2D6 | UGT1A4, CYP2C19 | Highly variable |
| Olanzapine | CYP1A2, UGT1A4 | - | Smoking affects levels |
| Risperidone | CYP2D6 | CYP3A4 | 9-OH-risperidone active |
| Aripiprazole | CYP2D6 | CYP3A4 | Dose adjustment for PM |
| Quetiapine | CYP3A4 | - | Wide therapeutic index |
| Haloperidol | CYP2D6, CYP3A4 | - | PM needs dose reduction |
| Iloperidone | CYP2D6 | - | Dose adjustment required |
| Brexpiprazole | CYP2D6 | - | Dose adjustment for PM |

### 20.3 ADHD Medications

| Drug | Primary Gene | Notes |
|------|-------------|-------|
| Atomoxetine | CYP2D6 | PM requires dose reduction |
| Amphetamine salts | CYP2D6 | Minimal PGx effect |
| Methylphenidate | Minimal CYP involvement | Limited PGx data |
| Guanfacine | CYP3A4 | Extended-release formulation |
| Clonidine | Minimal CYP involvement | Limited PGx data |

### 20.4 Mood Stabilizers

| Drug | Primary Gene | Secondary Genes | Clinical PGx |
|------|-------------|----------------|-------------|
| Lithium | Minimal (renal transporters) | SLC6A4? | Limited evidence |
| Valproic acid | UGTs, beta-oxidation | - | UGT pharmacogenomics |
| Carbamazepine | HLA-B*15:02 (Asian ancestry) | CYP2C9, CYP3A4 | HLA-B mandatory screening |
| Lamotrigine | UGT1A4 | - | Limited evidence |
| Oxcarbazepine | HLA-B*15:02 | - | HLA-B screening in Asian populations |

### 20.5 Anxiolytics and Sedatives

| Drug | Primary Gene | Notes |
|------|-------------|-------|
| Diazepam | CYP2C19 | PM has prolonged sedation |
| Alprazolam | CYP3A4 | Interactions with CYP3A4 inhibitors |
| Lorazepam | UGT2B15 | Glucuronidation |
| Zolpidem | CYP3A4, CYP1A2 | Gender and food effects |
| Eszopiclone | CYP3A4, CYP2E1 | Limited PGx data |

### 20.6 Other Neurological

| Drug | Primary Gene | Clinical PGx Relevance |
|------|-------------|----------------------|
| Modafinil | CYP2C19, CYP3A4 | Label mentions CYP2D6 |
| Donepezil | CYP2D6, CYP3A4 | Limited PGx clinical utility |
| Memantine | Minimal (renal) | Limited PGx data |

---

## 21. Appendix: License Compatibility Matrix

### 21.1 License Summary

| Resource | License | Commercial Use | Attribution | Share-Alike | Key Obligations |
|----------|---------|---------------|-------------|-------------|----------------|
| ClinPGx/PharmGKB | CC BY-SA 4.0 | Yes | Yes | Yes | Attribute; share derivatives |
| CPIC Guidelines | Free/Open | Yes | Yes | No | Cite guideline |
| PharmVar | Terms of Use | Yes | Yes | No | API key required; cite |
| ClinVar | Public Domain | Yes | No | No | None (US Gov) |
| FDA Biomarkers | Public Domain | Yes | No | No | None (US Gov) |
| openFDA | CC0 | Yes | No | No | None |
| RxNorm | UMLS License | Yes | Yes | No | UMLS agreement; annual report |
| DailyMed | Public Domain | Yes | No | No | None (US Gov) |
| GWAS Catalog | CC0 | Yes | No | No | None |
| dbSNP | Public Domain | Yes | No | No | None (US Gov) |
| 1000 Genomes | Open Access | Yes | No | No | Cite publication recommended |

### 21.2 Integration Notes

**For Commercial Products:**
1. **ClinPGx data:** Must include attribution and use CC BY-SA 4.0 for derivative datasets
2. **RxNorm:** Requires UMLS license agreement with NLM; must file annual usage report
3. **PharmVar:** Free API key required; terms of service must be accepted
4. **All US government data:** (ClinVar, FDA, openFDA, DailyMed, dbSNP) - no restrictions

**For Academic/Research Use:**
1. All resources are freely usable
2. Citation of source publications is required by academic norms
3. ClinPGx requires CC BY-SA 4.0 compliance for derived datasets

### 21.3 Recommended Citation

When using these resources in a clinical pharmacogenomics pipeline, cite:

```
ClinPGx/PharmGKB: [ClinPGx.org, PMID references]
CPIC Guidelines: [CPIC guideline specific PMIDs]
PharmVar: [PharmVar.org, GeneFocus publications]
ClinVar: [Landrum et al., Nucleic Acids Res, PMID: 26582918]
openFDA: [open.fda.gov]
RxNorm: [National Library of Medicine]
1000 Genomes: [1000 Genomes Project Consortium, Nature, PMID: 26432245]
GWAS Catalog: [Buniello et al., Nucleic Acids Res, PMID: 30445434]
```

---

## Quick Reference Card

| Task | Primary Resource | API Endpoint | Format |
|------|-----------------|------------|--------|
| Get gene-drug annotation | ClinPGx | `api.clinpgx.org/v1/data/clinicalAnnotation/{id}` | JSON |
| Get CPIC dosing guideline | ClinPGx | `api.clinpgx.org/v1/data/guideline/{id}` | JSON |
| Get allele definition | PharmVar | `pharmvar.org/api-service/alleles/{name}` | JSON |
| Check variant pathogenicity | ClinVar | `eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=clinvar` | XML |
| Get allele frequency | 1000 Genomes | `ftp.1000genomes.ebi.ac.uk` | VCF |
| Check FDA label for PGx | openFDA | `api.fda.gov/drug/label.json` | JSON |
| Normalize drug name | RxNorm | `rxnav.nlm.nih.gov/REST/rxcui` | JSON/XML |
| Download full drug label | DailyMed | `dailymed.nlm.nih.gov` | SPL XML |
| Find GWAS associations | GWAS Catalog | `ebi.ac.uk/gwas/api/search` | JSON |
| Resolve rsID | dbSNP | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=snp` | XML |
| Get population frequencies | dbSNP ALFA | `api.ncbi.nlm.nih.gov/variation/v0/refsnp/{rsid}` | JSON |

---

*Document generated by DeepSynaps Protocol Studio Research Division*
*For questions or updates, contact: research@deepsynaps.io*
*Version 1.0.0 | 2026-07-10*
