# DeepSynaps Protocol Studio — Master Knowledge Layer Architecture

> **Version:** 1.0.0 | **Status:** PHASE 0 FOUNDATION — Canonical | **Date:** 2026-05-19  
> **Owner:** Chief Systems Architect | **Classification:** Strategic Architecture — Cross-Layer Integration

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Five-Layer Architecture](#2-five-layer-architecture)
3. [Canonical Schema Summary](#3-canonical-schema-summary)
4. [Adapter Architecture Summary](#4-adapter-architecture-summary)
5. [Intelligence Layer Summary](#5-intelligence-layer-summary)
6. [Governance Summary](#6-governance-summary)
7. [UX Rules Summary](#7-ux-rules-summary)
8. [Database Prioritization](#8-database-prioritization)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Risk Assessment](#11-risk-assessment)
12. [Success Criteria](#12-success-criteria)

---

## 1. Executive Summary

### 1.1 What Is the Knowledge Layer

The DeepSynaps Knowledge Layer is the unified intelligence substrate of the Protocol Studio platform. It aggregates, normalizes, governs, and presents clinical knowledge from **73+ external databases** spanning medications, neuroimaging, pharmacogenomics, clinical evidence, biomarkers, nutrition, and safety data. The Knowledge Layer transforms raw external data into actionable, audited, confidence-scored clinical insights presented through a safety-first user experience.

### 1.2 Why It Exists

Clinical neuromodulation protocols require evidence synthesis across an unprecedented breadth of domains. No single database provides this breadth. The Knowledge Layer exists to:

- **Unify** 73+ heterogeneous databases under a single canonical schema
- **Govern** all data with provenance tracking, confidence scoring, and research-only flagging
- **Fuse** multimodal signals (genetic, imaging, pharmacological, biometric) into coherent hypotheses
- **Protect** patients through strict PHI boundaries, audit trails, and clinician-review gates
- **Comply** with FDA GMLP, EU AI Act, HIPAA, and Joint Commission RUAIH frameworks

### 1.3 Five-Layer Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│ LAYER 5 — UX / Clinical Presentation                      │
│ Evidence display, uncertainty UX, research flags, safety  │
│ rules, readability standards, human-in-the-loop gates     │
├───────────────────────────────────────────────────────────┤
│ LAYER 4 — Governance                                      │
│ Provenance, licensing, PHI boundaries, audit logging,     │
│ confidence scoring, research-only classification          │
├───────────────────────────────────────────────────────────┤
│ LAYER 3 — Intelligence                                    │
│ DeepTwin, multimodal fusion, hypothesis ranking,          │
│ evidence grading, cross-modal correlation                 │
├───────────────────────────────────────────────────────────┤
│ LAYER 2 — Database Adapters                               │
│ 73 database adapters, schema mapping, ETL pipelines,      │
│ caching, rate limiting, error resilience                  │
├───────────────────────────────────────────────────────────┤
│ LAYER 1 — Canonical Clinical Schema                       │
│ Unified data model, provenance model, confidence model,   │
│ cross-reference graph, entity relationship model          │
└───────────────────────────────────────────────────────────┘
```

### 1.4 Key Principles

| Principle | Description |
|-----------|-------------|
| **Provenance Everywhere** | Every datum carries its source, retrieval timestamp, and provenance chain |
| **Confidence Scoring** | Every output carries a confidence score (0.0–1.0) with methodology |
| **Research-Only Flagging** | Data not suitable for clinical decision-making is explicitly flagged |
| **No Autonomous Diagnosis** | The system never diagnoses or prescribes autonomously |
| **Clinician Review Gate** | All AI-generated outputs require clinician review before clinical use |
| **PHI Boundary Enforcement** | Strict clinic-scoped data isolation with audit logging |
| **Licensing Compliance** | Every database integration respects its license terms |

### 1.5 Phase 0 Status

Phase 0 (Foundation) is **complete**. Deliverables produced:

- [x] Canonical clinical schema with TypedDict contracts
- [x] Audit event schema with 25+ event types
- [x] Evidence link model with grading (A–D) and provenance types
- [x] Handbook generation workflow with safety guardrails
- [x] Database registry cataloging 73 databases across 14 domains
- [x] Database requirements research for 4 domain clusters
- [x] Integration architecture with 4-layer adapter pattern
- [x] Caching strategy with TTL per data type
- [x] Technology stack selected (FastAPI, SQLAlchemy 2.0, pgvector, Redis, Celery)
- [x] AI safety governance framework (FDA GMLP, EU AI Act, RUAIH)
- [x] Clinical intelligence UX rules for evidence presentation

---

## 2. Five-Layer Architecture

### 2.1 Layer Interactions

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5: UX / Clinical Presentation                                │
│  Evidence grade display, confidence visualization, research-only    │
│  banners, uncertainty quantification, clinician review workflow     │
├──────────────────────┬──────────────────────────────────────────────┤
│  Interface: UXRulesContract                                         │
│  Cross-layer: Receives confidence scores from L4, evidence from L3  │
├──────────────────────┴──────────────────────────────────────────────┤
│  LAYER 4: Governance                                                │
│  Provenance tracking, confidence scoring, research-only engine,     │
│  PHI boundary enforcement, audit logging, licensing compliance      │
├──────────────────────┬──────────────────────────────────────────────┤
│  Interface: GovernanceContract                                      │
│  Cross-layer: Wraps L3 outputs with provenance + confidence         │
├──────────────────────┴──────────────────────────────────────────────┤
│  LAYER 3: Intelligence                                              │
│  DeepTwin interface, evidence fusion, hypothesis ranking,           │
│  evidence grading (A–D), relevance scoring, RAG pipeline            │
├──────────────────────┬──────────────────────────────────────────────┤
│  Interface: IntelligenceContract                                    │
│  Cross-layer: Consumes canonical entities from L1 via L2 adapters   │
├──────────────────────┴──────────────────────────────────────────────┤
│  LAYER 2: Database Adapters                                         │
│  73 database adapters, unified ExternalAPIAdapter base, schema      │
│  mapping, ETL, caching (Redis + local), rate limiting, resilience   │
├──────────────────────┬──────────────────────────────────────────────┤
│  Interface: AdapterContract (fetch_with_fallback)                   │
│  Cross-layer: Maps all external schemas to L1 canonical schema      │
├──────────────────────┴──────────────────────────────────────────────┤
│  LAYER 1: Canonical Clinical Schema                                 │
│  Handbook, HandbookSection, EvidenceLink, AuditEvent entities.      │
│  Cross-reference graph: rxCUI, drugbank_id, rs_id, sctid, loinc,    │
│  pmid, nct_id, mni_coords, etc. Provenance + confidence models.     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User Query → L5 UX Layer → L4 Governance Gate → L3 Intelligence
     ↑                           ↓
     └──────── Response ←───────┘
                     ↓
       ┌──── L2 Adapter Query ────┐
       ↓         ↓         ↓
   [Adapter A] [Adapter B] [Adapter C] → L1 Canonical Schema
```

### 2.3 Layer Dependencies

| Layer | Depends On | Contract Type |
|-------|-----------|---------------|
| L5 UX | L4 Governance, L3 Intelligence | UXRulesContract |
| L4 Governance | L3 Intelligence, L2 Adapters | GovernanceContract |
| L3 Intelligence | L2 Adapters, L1 Schema | IntelligenceContract |
| L2 Adapters | L1 Schema, External APIs | AdapterContract |
| L1 Schema | None (foundation) | CanonicalSchemaContract |

---

## 3. Canonical Schema Summary

### 3.1 Core Entities

The canonical schema defines the unified data model that all database adapters map into.

#### Handbook Entity

```python
class Handbook(TypedDict, total=False):
    handbook_id:        str           # UUID v4
    clinic_id:          str           # Multi-tenancy partition key
    patient_id:         Optional[str] # Null = generic guide
    audience:           str           # "clinician" | "patient" | "staff_sop"
    title:              str
    condition:          str
    modality:           str           # TMS | tDCS | tACS | tRNS | taVNS | ...
    device:             str
    intervention_type:  str
    sections:           List[HandbookSection]
    evidence_links:     List[EvidenceLink]
    review_state:       str           # draft | needs_review | approved | signed | exported | superseded
    audit_log:          List[AuditEvent]
    provenance:         str           # ai_generated | clinician_edited | template_based
    evidence_threshold: str           # A | B | C | D | all
    reading_level:      str           # professional | advanced | standard | simple
    created_by:         str
    created_at:         str
    updated_at:         str
```

#### HandbookSection Entity

```python
class HandbookSection(TypedDict):
    section_id:     str           # UUID v4
    title:          str
    content:        str           # Markdown-formatted
    evidence_links: List[str]     # FK to EvidenceLink.link_id
    generated_by:   str           # ai | clinician | template
    reviewed:       bool
    review_notes:   Optional[str]
```

#### EvidenceLink Entity

```python
class EvidenceLink(TypedDict):
    link_id:         str     # UUID v4
    source:          str     # pubmed | cochrane | nice | fda | internal_db | ...
    title:           str
    authors:         str
    year:            int
    doi:             Optional[str]
    evidence_grade:  str     # A | B | C | D
    provenance:      str     # measured | inferred | proxy | simulated
    relevance_score: float   # 0.0 – 1.0
    clinical_note:   str
```

#### AuditEvent Entity

```python
class AuditEvent(TypedDict):
    event_id:    str            # UUID v4
    event_type:  str            # 25+ types (see below)
    timestamp:   str            # ISO-8601 with timezone
    user_id:     str
    clinic_id:   str
    handbook_id: str
    patient_id:  Optional[str]
    metadata:    Dict[str, Any]
    result:      str            # success | failure | denied
    reason:      Optional[str]
```

**Audit Event Types:** `HANDBOOK_GENERATED`, `HANDBOOK_APPROVED`, `HANDBOOK_SIGNED`, `HANDBOOK_EXPORT_COMPLETED`, `HANDBOOK_PATIENT_GUIDE_GEN`, `HANDBOOK_SUPERCEDED`, `HANDBOOK_REVIEW_STARTED`, `HANDBOOK_REVIEW_COMPLETED`, `HANDBOOK_SECTION_EDITED`, `HANDBOOK_SAFETY_FLAGGED`, `HANDBOOK_DISCLAIMER_SHOWN`, `HANDBOOK_CONTENT_BLOCKED`, `HANDBOOK_ACCESS_DENIED`, `HANDBOOK_ENTITLEMENT_CHECKED`, `HANDBOOK_EVIDENCE_LOOKUP`

### 3.2 Cross-Reference Graph

| Identifier | System | Used By |
|------------|--------|---------|
| `rxCUI` | RxNorm | Drug entities |
| `drugbank_id` | DrugBank | Drug property lookup |
| `atc_code` | ATC | Therapeutic category |
| `rs_id` / `rsID` | dbSNP | Reference SNP |
| `clinvar_id` | ClinVar | Variant interpretations |
| `sctid` | SNOMED CT | Clinical concepts |
| `loinc_code` | LOINC | Lab test identifiers |
| `icd10_code` | ICD-10-CM | Diagnosis coding |
| `pmid` | PubMed | Publication reference |
| `nct_id` | ClinicalTrials.gov | Trial registry |
| `mni_coords` | MNI152 | Standard brain coordinates |
| `fdc_id` | USDA FDC | Nutrition data lookup |

### 3.3 Entity Relationship Model

```
Handbook ──< Section >── EvidenceLink
   │                        │
   v                        v
AuditEvent              Drug ──> DrugBank/RxNorm/ATC
                        Gene ──> PharmGKB/ClinVar/dbSNP
                        BrainRegion ──> MNI152/AAL Atlas
                        OutcomeMeasure ──> PROMIS/Neuro-QOL
```

---

## 4. Adapter Architecture Summary

### 4.1 Adapter Interface

All 73 database adapters implement a unified interface:

```python
class ExternalAPIAdapter:
    retry_policy = RetryPolicy(max_retries=3, backoff_factor=2.0,
                               status_forcelist=[429,500,502,503,504])
    rate_limit = RateLimit(requests_per_second=10, burst_size=20)

    async def fetch_with_fallback(self, query: str) -> dict:
        # 1. Check cache → 2. Call API with retry → 3. Fallback to local → 4. Update cache
```

### 4.2 Adapter Registry

| Status | Count | LOC Est. | Domain Coverage |
|--------|-------|----------|-----------------|
| Already Integrated (ACTIVE) | 13 | ~12,081 | Medication, Neuroimaging, EEG, Evidence, Device |
| Critical Priority (NEEDED) | 20 | ~7,100 | Core terminology, safety, genomics, atlases |
| High Priority (NEEDED) | 20 | ~6,350 | Advanced genomics, imaging repos, outcomes |
| Medium Priority (NEEDED) | 20 | ~5,100 | Specialized evidence, population health |
| **TOTAL** | **73** | **~30,631** | **14 domains** |

### 4.3 File Naming Convention

```
{DATABASE_NAME}_{type}.py  →  _client.py | _importer.py | _service.py |
                                _models.py | _router.py | _cache.py | _test.py
```

### 4.4 Caching Strategy

| Data Type | Cache Duration | Storage |
|-----------|---------------|---------|
| Drug data | 24 hours | Redis + Local |
| Evidence data | 1 week | PostgreSQL |
| Normative data (EEG, MRI) | 1 month | Local files + SQLite |
| Genetic data | 1 month | PostgreSQL |
| Trial data | 3 days | Redis |
| Atlas data | 1 month | Local files |
| Terminology | 6 months | PostgreSQL |
| Adverse events | 1 week | PostgreSQL |
| Wearable data | 5 minutes | Redis |

### 4.5 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| API Framework | FastAPI | REST endpoints |
| ORM | SQLAlchemy 2.0 | Database models |
| Async HTTP | httpx | External API calls |
| Cache | Redis | Hot data caching |
| Vector DB | pgvector (PostgreSQL) | RAG similarity search |
| Task Queue | Celery + Redis | Background imports |
| Validation | Pydantic v2 | Request/response models |
| Testing | pytest + httpx | Unit + integration tests |
| Monitoring | Prometheus + Grafana | Metrics and alerts |

### 4.6 API Endpoint Design

```
/api/v1/drug/         → DrugBank, RxNorm, ATC, NDC, OnSIDES
/api/v1/safety/       → FAERS, MedDRA, SIDER, OffSIDES/TwoSIDES
/api/v1/genomics/     → PharmGKB, ClinVar, gnomAD, dbSNP, PharmCAT
/api/v1/neuro/        → MRI atlases, fNIRS, brain targets
/api/v1/eeg/          → EEG signal, normative data, qEEG
/api/v1/evidence/     → PubMed, Cochrane, ClinicalTrials.gov
/api/v1/biomarker/    → LOINC, BDNF, HRV, NHANES
/api/v1/nutrition/    → USDA FoodData, DSLD
/api/v1/terminology/  → SNOMED CT, ICD-10, UMLS
/api/v1/outcome/      → PROMIS, Neuro-QOL, 6MWT, MoCA
/api/v1/wearable/     → Fitbit, Oura, Garmin, Withings
```

---

## 5. Intelligence Layer Summary

### 5.1 Fusion Engine Pipeline

```
1. Entity Extraction → drugs, genes, brain regions from query (mapped to L1)
2. Parallel DB Queries → all relevant L2 adapters queried simultaneously
3. Evidence Normalization → all results mapped to EvidenceLink format
4. Cross-Modal Fusion → detect correlations across modalities
5. Hypothesis Ranking → composite score = relevance × evidence_weight × confidence
6. Governed Output → confidence score + evidence grade + provenance chain + research flag
```

### 5.2 DeepTwin Interface

The DeepTwin is the multimodal patient model integrating patient-specific data:

| Component | Data Source | Canonical Entity | Update Frequency |
|-----------|-------------|-------------------|-----------------|
| Patient Profile | EHR/clinic data | Patient + Diagnosis | Per visit |
| Pharmacogenome | PharmGKB + ClinVar + PharmCAT | GeneVariant + PGxAnnotation | Once |
| Brain Model | MRI atlases + qEEG | BrainRegion + EEGProfile | Per scan |
| Medication List | RxNorm + DrugBank | Medication + DrugInteraction | Per prescription |
| Biomarkers | LOINC + NHANES | BiomarkerReading | Per lab draw |
| Wearables | Fitbit/Oura/Garmin | WearableReading | Real-time |
| Nutrition | USDA FDC + DSLD | NutritionIntake | Daily |
| Outcomes | PROMIS + Neuro-QOL | OutcomeScore | Per assessment |

### 5.3 Evidence Grading

| Grade | Definition | Sources |
|-------|-----------|---------|
| **A** | High-quality RCTs, meta-analyses, systematic reviews | Cochrane, PubMed (RCT filter) |
| **B** | Moderate-quality evidence, limited RCTs, cohort studies | ClinicalTrials.gov, PEDro |
| **C** | Observational studies, case series, expert opinion | PubMed (observational) |
| **D** | Preclinical, anecdotal, theoretical | Animal studies |

### 5.4 RAG Pipeline

```
User Query → Preprocessing → Vector Search (pgvector) + Lexical Search
     ↓
Evidence Scoring → LLM Composition with Retrieved Passages
     ↓
Inline Citations + Provenance → Post-processing → Final Output
```

Key parameters: **Temperature 0.0–0.3** for clinical content. Minimum grade **B** for clinical outputs. Every claim linked to **EvidenceLink with DOI**.

### 5.5 Cross-Modal Correlation Examples

```
Drug (Citalopram) + Gene (CYP2C19 *2) → Metabolizer status (PM/IM/EM/UM)
Brain target (DLPFC) + Gene (BDNF Val66Met) → TMS response prediction
EEG profile (alpha asymmetry) + Protocol (HF-rTMS) → Outcome prediction
Biomarker (BDNF) + Wearable (HRV) + Nutrition (MIND) → Composite health index
```

---

## 6. Governance Summary

### 6.1 Provenance Model

| Provenance Type | Definition | Example |
|----------------|-----------|---------|
| **measured** | Directly measured primary data | qEEG reading, lab result |
| **inferred** | Reasonably inferred from related data | Drug interaction from mechanism |
| **proxy** | Proxy measure from related study | Sham-controlled RCT for efficacy |
| **simulated** | Computational simulation | Electric field model (SimNIBS) |

### 6.2 Confidence Scoring

```
Entity Confidence:     Direct match 0.9–1.0 | Cross-ref 0.7–0.9 | Inferred 0.5–0.7 | Unverified <0.5
Hypothesis Confidence: Single source 0.3–0.5 | Multi-source 0.5–0.7 | Cross-modal 0.7–0.9 | Validated 0.9–1.0
System Confidence:     All verified >0.8 | Partial 0.5–0.8 | Gaps <0.5
```

### 6.3 Research-Only Classification

Data is classified **research-only** when: source is explicitly research-grade, evidence grade is D, confidence < 0.5, non-peer-reviewed, computational predictions without clinical validation, or off-label without evidence.

**Research-only data is NEVER presented as clinical evidence.** Displayed with prominent "Research Only" banner + explanation + references.

### 6.4 PHI Boundaries

| PHI Rule | Implementation |
|----------|---------------|
| Clinic isolation | `clinic_id` partition key on all queries |
| Patient scoping | `patient_id` only accessible within clinic |
| Audit logging | Every data access logged with user + clinic + timestamp |
| Break-glass | Emergency override requires dual authorization + justification |
| Data retention | Configurable per clinic; default 7 years |
| Anonymization | IP addresses and user agents anonymized in logs |

### 6.5 Licensing Compliance Matrix

| Database | License | Cost | Restriction |
|----------|---------|------|-------------|
| RxNorm | Free (UMLS) | $0 | Academic/non-commercial |
| DrugBank | CC BY-NC / CC0 | $0 acad / Paid | Academic downloads paused |
| OnSIDES | Academic Free | $0 | Research only |
| PharmGKB | CC BY-SA 4.0 | $0 | Attribution-ShareAlike |
| FAERS | Open Data | $0 | None (US Govt) |
| SNOMED CT | Free (via NLM) | $0 | UMLS account |
| Cochrane | Subscription | $$ | Institutional access |
| CPT | Paid (AMA) | $$ | Copyright protected |

### 6.6 Regulatory Compliance Matrix

| Regulation | Requirement | Implementation |
|------------|------------|----------------|
| FDA GMLP | 10 guiding principles | All outputs have provenance + confidence |
| EU AI Act (Art. 6) | High-risk AI requirements | Governance layer enforces all |
| Joint Commission RUAIH | 7 essential elements | Implemented in L4 |
| HIPAA | PHI protection, audit trail | Clinic scoping + audit logging + RBAC |
| ISO 14971 | Risk management | Risk assessment (Section 11) |
| ISO 13485 | Quality management | Review workflow + quality gates |
| 21 CFR Part 11 | Electronic records/signatures | Audit trail + digital signature |

---

## 7. UX Rules Summary

### 7.1 Evidence Display Rules

| Rule | Implementation |
|------|---------------|
| Evidence grade badges | A/B/C/D with color coding |
| Provenance indicators | Icon for measured/inferred/proxy/simulated |
| Source links | Every citation hyperlinked with DOI |
| Evidence count | Number of supporting sources displayed |

### 7.2 Uncertainty Presentation

| Confidence | Visual | Action |
|------------|--------|--------|
| High (>0.8) | Green indicator | Normal review |
| Medium (0.5–0.8) | Yellow indicator, warning | Clinician should verify |
| Low (<0.5) | Red indicator, prominent warning | Expert review required |
| Research-only | Banner overlay, grayed text | Acknowledge as research |

### 7.3 Safety Rules

| Rule | Implementation |
|------|---------------|
| No autonomous diagnosis | System never generates diagnoses |
| No autonomous prescription | System never prescribes |
| Research data isolation | Research data cannot enter clinical workflows |
| Clinician review gate | All AI outputs require clinician approval |
| Safety disclaimer | Auto-appended to patient-facing materials |
| Content blocking | Forbidden phrases automatically blocked |
| Temperature control | LLM temperature 0.0–0.3 for clinical content |
| Hallucination prevention | RAG + prompt engineering + output verification |

### 7.4 Readability Standards

| Audience | Reading Level | Flesch-Kincaid |
|----------|-------------|----------------|
| Clinician | Professional | Grade 12–16 |
| Patient | Standard | Grade 6–8 |
| Staff SOP | Advanced | Grade 8–10 |

---

## 8. Database Prioritization

### 8.1 P0 — Critical (11 Databases)

| # | Database | Domain | Purpose | Effort |
|---|----------|--------|---------|--------|
| 1 | **RxNorm** | Terminology | Universal drug vocabulary | 400 LOC |
| 2 | **PharmGKB** | Pharmacogenomics | Gene-drug interactions, CPIC | 600 LOC |
| 3 | **FAERS** | Safety | Adverse event monitoring | 500 LOC |
| 4 | **OnSIDES** | Safety | On-label ADEs (7M+ pairs) | 400 LOC |
| 5 | **ClinVar** | Genetics | Variant interpretation | 500 LOC |
| 6 | **PubMed API** | Evidence | Literature (35M+ citations) | 400 LOC |
| 7 | **ClinicalTrials.gov** | Evidence | Trial registry (500K+) | 400 LOC |
| 8 | **LOINC** | Labs | Biomarker coding | 300 LOC |
| 9 | **USDA FoodData** | Nutrition | Food composition | 200 LOC |
| 10 | **MNI152** | Neuroimaging | Standard brain template | 100 LOC |
| 11 | **TMS Atlas** | Stimulation | Evidence-based TMS targets | 150 LOC |
| | | | **Total P0:** | **~3,950 LOC** |

### 8.2 P1 — High Priority (7 Databases)

| # | Database | Domain | Purpose | Effort |
|---|----------|--------|---------|--------|
| 1 | **SNOMED CT** | Terminology | Clinical terminology (300K+) | 500 LOC |
| 2 | **PharmCAT** | Pharmacogenomics | Clinical PGx annotation | 400 LOC |
| 3 | **OffSIDES/TwoSIDES** | Safety | Off-label ADEs / DDIs | 350 LOC |
| 4 | **Cochrane** | Evidence | Gold-standard reviews | 350 LOC |
| 5 | **NIH PROMIS** | Outcomes | 500+ patient measures | 350 LOC |
| 6 | **AAL Atlas** | Neuroimaging | 116 brain regions | 150 LOC |
| 7 | **Allen Brain** | Genetics | Brain gene expression | 400 LOC |
| | | | **Total P1:** | **~2,500 LOC** |

### 8.3 P2 — Medium Priority (Advanced)

| Category | Key Databases |
|----------|---------------|
| Pharmacovigilance | SIDER, MedWatch, WHO VigiBase |
| Chemical | PubChem, ChEBI |
| Genomics | gnomAD, dbSNP, OMIM, GTEx, KEGG |
| Neuroimaging | Schaefer, HCP-MMP1, OpenNeuro, Neurosynth |
| Evidence | Epistemonikos, TRIP, PEDro, NICE |
| Outcomes | Neuro-QOL, 6MWT, MoCA, GAD-7/PHQ-9 |
| Biomarkers | NHANES, BDNF Reference, HRV Norms |
| Wearables | Fitbit, Oura, Garmin, Apple HealthKit, Withings |
| Terminology | UMLS, MedDRA, ICD-10-PCS |
| **Total P2** | **~5,100 LOC** |

### 8.4 Domain Coverage Summary

| Domain | Active | P0 | P1 | P2 | Total |
|--------|--------|-----|-----|-----|-------|
| Medication | 3 | 3 | 0 | 2 | 8 |
| Safety | 0 | 2 | 1 | 3 | 6 |
| Pharmacogenomics | 1 | 1 | 1 | 2 | 5 |
| Neuroimaging | 2 | 2 | 1 | 4 | 9 |
| EEG/qEEG | 2 | 0 | 0 | 1 | 3 |
| Evidence | 2 | 2 | 1 | 3 | 8 |
| Terminology | 0 | 2 | 1 | 2 | 5 |
| Biomarkers | 0 | 1 | 0 | 1 | 2 |
| Nutrition | 1 | 1 | 0 | 2 | 4 |
| Outcome Measures | 0 | 0 | 1 | 3 | 4 |
| Wearables | 1 | 0 | 0 | 5 | 6 |
| Genetics | 0 | 1 | 1 | 6 | 8 |
| Brain Stimulation | 1 | 1 | 0 | 2 | 3 |
| **TOTAL** | **13** | **16** | **7** | **37** | **73** |

---

## 9. Implementation Roadmap

### 9.1 Phase Overview

```
Phase 0 (NOW)   ████████████████████████████████████████  ✅ FOUNDATION — COMPLETE
Phase 1         ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  🔄 Critical DBs
Phase 2         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ⏳ Multimodal Expansion
Phase 3         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ⏳ Advanced Analytics
Phase 4         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ⏳ DeepTwin Integration
Phase 5         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ⏳ Scale
```

### 9.2 Phase 0 — Foundation (COMPLETE)

All 10 Phase 0 deliverables finalized including canonical schema, adapter architecture, intelligence layer, governance, UX rules, database registry, and 4 domain-specific requirement documents.

### 9.3 Phase 1 — Critical Databases (Weeks 1–5)

```
Week 1:  Terminology Foundation  → RxNorm, LOINC, ICD-10-CM, USDA FoodData
Week 2:  Safety & Evidence Core  → FAERS, OnSIDES, PubMed, ClinicalTrials.gov
Week 3:  Genomics Core           → PharmGKB, ClinVar, gnomAD
Week 4:  Neuroimaging Standards  → MNI152, TMS Atlas, AAL Atlas
Week 5:  Quality & Integration   → Integration testing, cross-ref validation
```
**Goal:** ~3,950 LOC | **Target:** All P0 databases operational

### 9.4 Phase 2 — Multimodal Expansion (Weeks 6–10)

```
Week 6:  Advanced Terminology    → SNOMED CT, OffSIDES/TwoSIDES, MedDRA
Week 7:  Pharmacogenomics        → PharmCAT, PharmVar, CPIC guidelines
Week 8:  Evidence & Outcomes     → Cochrane, NIH PROMIS, Neuro-QOL
Week 9:  Neuroimaging            → Schaefer, HCP-MMP1, Allen Brain Atlas
Week 10: Multimodal Fusion       → Cross-DB join engine, evidence fusion, hypothesis ranking
```
**Goal:** ~2,500 LOC + fusion engine

### 9.5 Phase 3 — Advanced Analytics (Weeks 11–15)

P2 database integration + cross-modal correlation + longitudinal analysis. Key deliverables: expanded database adapters, correlation detection, composite health scoring, advanced evidence grading.

### 9.6 Phase 4 — DeepTwin Integration (Weeks 16–20)

Full multimodal patient model: patient profile unification, pharmacogenome integration, brain model fusion, personalized protocol recommendations, predictive outcome modeling, AI safety certification (red teaming, bias assessment, EU AI Act compliance documentation).

### 9.7 Phase 5 — Scale (Weeks 21+)

Enterprise features: multi-clinic federation, research collaboration data sharing, EHR integration (HL7 FHIR), horizontal scaling (Kubernetes), multi-region deployment, SOC 2 Type II certification.

---

## 10. Cross-Cutting Concerns

### 10.1 Concern Matrix

| Concern | L1 Schema | L2 Adapters | L3 Intelligence | L4 Governance | L5 UX |
|---------|-----------|-------------|-----------------|---------------|-------|
| **Provenance** | Types defined | Records source | Tracks chain | Validates | Displays |
| **Confidence** | Model defined | Entity score | Composite score | Threshold check | Visualizes |
| **Research-only** | Classification | Flags sources | Excludes from clinical fusion | Enforces | Banner display |
| **Audit logging** | Schema defined | Operation logging | Fusion step logging | All events | User actions |
| **PHI** | `clinic_id` key | Scoped queries | Scoped models | Boundary enforcement | Session mgmt |
| **Licensing** | N/A | Per-adapter tracking | License-aware fusion | Compliance matrix | Attribution |
| **Uncertainty** | N/A | N/A | Quantification | Validation | Display |

### 10.2 Implementation Pattern

```python
@requires_provenance
@requires_confidence_score
@enforces_phi_boundary
@logs_audit_event
@checks_research_only_flag
async def query_knowledge_layer(query: ClinicalQuery) -> GovernedResponse:
    ...
```

---

## 11. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Schema changes break adapters | Medium | Versioned adapters, migration scripts, contract testing |
| External DB license conflicts | Medium | License compliance matrix, legal review, usage tracking |
| PHI exposure across clinics | High | Strict clinic scoping, audit, break-glass with dual auth |
| Research data presented as clinical | High | Research-only flagging, clinician review gate, auto-checks |
| Performance with 73 databases | Medium | Caching (multi-tier), lazy loading, query optimization |
| AI hallucination in clinical content | High | RAG pipeline, temperature 0.0, dual-query verification, HITL |
| External API rate limiting | Medium | Retry with backoff, request queuing, cache fallback |
| Cross-modal false correlations | Medium | Statistical testing, clinician review, evidence grading |
| Regulatory non-compliance (EU AI Act) | High | Governance layer, audit trail, risk management, QMS |

### Risk Heat Map

```
Impact
  HIGH    ┌─────────────────────────────────────┐
          │  PHI Exposure    Research→Clinical   │
          │  [MITIGATE]      [MITIGATE]          │
          │  AI Hallucination EU AI Act          │
          │  [PREVENT]       [COMPLY]            │
  MEDIUM  ┌─────────────────────────────────────┤
          │  Schema breaks    License conflicts   │
          │  [MANAGE]         [TRACK]             │
          │  73-DB perf.      False correlations  │
          │  [OPTIMIZE]       [REVIEW]            │
  LOW     ┌─────────────────────────────────────┤
          │  Data staleness   Rate limiting       │
          │  [MONITOR]        [HANDLE]            │
          └─────────────────────────────────────┘
            LOW       MEDIUM      HIGH
                      Likelihood
```

---

## 12. Success Criteria

### 12.1 Technical Success Criteria

| # | Criterion | Target |
|---|-----------|--------|
| 1 | All clinical entities have provenance | 100% |
| 2 | All outputs have confidence scores | 100% |
| 3 | Research-only data never presented as clinical | 100% |
| 4 | No autonomous diagnosis or prescription | 100% |
| 5 | Full audit trail on all operations | 100% |
| 6 | Clinician review required for all AI outputs | 100% |
| 7 | Cross-modal fusion with uncertainty quantification | 100% |
| 8 | Test coverage >= 80% | >=80% |
| 9 | Type hint coverage | 100% |
| 10 | Async support for all I/O | 100% |

### 12.2 Clinical Success Criteria

| # | Criterion | Target |
|---|-----------|--------|
| 1 | Evidence grade visible on all citations | 100% |
| 2 | Drug-gene interaction coverage | >90% of CPIC guidelines |
| 3 | Adverse event data currency | <1 week |
| 4 | Literature coverage | 35M+ citations |
| 5 | Protocol parameter accuracy | >95% |

### 12.3 Governance Success Criteria

| # | Criterion | Target |
|---|-----------|--------|
| 1 | FDA GMLP compliance (all 10 principles) | Pass |
| 2 | EU AI Act compliance (Art. 6–17) | Pass |
| 3 | HIPAA compliance | Pass |
| 4 | Audit log immutability | 100% |
| 5 | PHI boundary enforcement | 100% |

---

## Appendix A: Cross-Reference to Layer Documents

| Layer | Document | Integration Points |
|-------|----------|-------------------|
| L1 — Canonical Schema | `DEEPSYNAPS_CANONICAL_SCHEMA.md` | Section 3: entities, cross-refs, ER model |
| L2 — Database Adapters | `DEEPSYNAPS_DATABASE_ADAPTER_ARCHITECTURE.md` | Section 4: interface, registry, caching |
| L3 — Intelligence | `DEEPSYNAPS_MULTIMODAL_INTELLIGENCE_LAYER.md` | Section 5: fusion, DeepTwin, RAG |
| L4 — Governance | `DEEPSYNAPS_KNOWLEDGE_GOVERNANCE.md` | Section 6: provenance, PHI, audit |
| L5 — UX | `DEEPSYNAPS_CLINICAL_INTELLIGENCE_UX_RULES.md` | Section 7: evidence display, safety |

## Appendix B: Database Requirement Sources

| Document | Databases | Domains |
|----------|-----------|---------|
| `DB_REQUIREMENTS_MEDICATION_PHARMA.md` | 34 | Drug DBs, pharmacogenomics, adverse events, coding |
| `DB_REQUIREMENTS_NEUROIMAGING.md` | 47 | Normative EEG, MRI atlases, stimulation targets |
| `DB_REQUIREMENTS_EVIDENCE_OUTCOMES.md` | 44 | Clinical evidence, outcomes, wearables, nutrition |
| `DB_REQUIREMENTS_GENETIC_PROTOCOL_SAFETY.md` | 46 | Genetics, neuromodulation protocols, safety |
| **Master Registry (deduped)** | **73** | **14 domains** |

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| AAL | Automated Anatomical Labeling atlas |
| ADE | Adverse Drug Event |
| ATC | Anatomical Therapeutic Chemical classification |
| BDNF | Brain-Derived Neurotrophic Factor |
| CPIC | Clinical Pharmacogenetics Implementation Consortium |
| FAERS | FDA Adverse Event Reporting System |
| GMLP | Good Machine Learning Practice (FDA) |
| HITL | Human-in-the-Loop |
| LOINC | Logical Observation Identifiers Names and Codes |
| MedDRA | Medical Dictionary for Regulatory Activities |
| MNI152 | Montreal Neurological Institute 152 template |
| PGx | Pharmacogenomics |
| PROMIS | Patient-Reported Outcomes Measurement Information System |
| qEEG | Quantitative Electroencephalography |
| RAG | Retrieval-Augmented Generation |
| RUAIH | Responsible Use of AI in Healthcare (Joint Commission) |
| SNOMED CT | Systematized Nomenclature of Medicine Clinical Terms |
| TMS | Transcranial Magnetic Stimulation |
| tDCS | Transcranial Direct Current Stimulation |
| UMLS | Unified Medical Language System |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-05-19 | Chief Systems Architect | Initial integration of all Phase 0 deliverables |

## Next Review

- Phase 1 review: End of Week 5
- Phase 2 review: End of Week 10
- Phase 3 review: End of Week 15
- Phase 4 review: End of Week 20
- Phase 5 review: Upon completion

---

*DeepSynaps Protocol Studio — Research Division*  
*Confidential — Internal Use Only*

