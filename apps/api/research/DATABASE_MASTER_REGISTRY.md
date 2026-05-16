# DeepSynaps Master Database Integration Registry

> **Version:** 1.0.0
> **Last Updated:** 2025-01-20
> **Owner:** Research Engineering Team
> **Status:** Living Document -- Updated Weekly

---

## Executive Summary

This registry documents **all clinical, neuroimaging, pharmacogenomic, evidence, and nutrition databases** required by the DeepSynaps Platform. It serves as the single source of truth for integration status, prioritization, and implementation planning across research and engineering teams.

**Quick Stats:**

| Metric | Count |
|--------|-------|
| Already Integrated | 13 databases (~12,081 LOC) |
| Critical Priority (needed) | 20 databases (~7,100 LOC est.) |
| High Priority (needed) | 20 databases (~6,350 LOC est.) |
| Medium Priority (needed) | 20 databases (~5,100 LOC est.) |
| **Total Databases** | **73 databases** |
| **Total Integration Size** | **~30,631+ LOC** |

---

## Section 1: Already Integrated (Status: ACTIVE)

These databases have **live integration code** in the DeepSynaps codebase. They are production-ready and actively used by platform services.

| Database | Service File | Lines | Status | External API | Local Cache |
|----------|-------------|-------|--------|-------------|-------------|
| DrugBank | drugbank_integration.py | 1,365 | Active | Yes | Yes |
| OpenFDA | openfda_client.py | 781 | Active | Yes | No |
| Medication Analyzer | medication_analyzer.py | 2,351 | Active | Internal | Yes |
| PGx Panel | pharmacogenomics_panel.py | 758 | Active | Partial | Yes |
| MRI Atlas | mri_atlas_service.py | 401 | Active | No | Yes |
| Brain Targets | brain_targets.py | 366 | Active | No | Yes |
| qEEG Protocol Fit | qeeg_protocol_fit.py | 472 | Active | No | Yes |
| EEG Signal | eeg_signal_service.py | 1,466 | Active | No | Yes |
| Evidence RAG | evidence_rag.py | 352 | Active | Yes | Partial |
| Evidence Intelligence | evidence_intelligence.py | 1,596 | Active | Yes | Yes |
| Device Sync | device_sync/ | ~2,000 | Active | Yes | Yes |
| Biomarker Bridge | biomarker_evidence_bridge.py | 117 | Active | No | Partial |
| Nutrition Bridge | nutrition_evidence_bridge.py | 222 | Active | No | Partial |

### 1.1 Integration Code Analysis

```
Total Lines of Active Integration Code: ~12,081
- Medication domain:      4,497 lines (DrugBank + OpenFDA + Med Analyzer)
- Pharmacogenomics:       1,124 lines (PGx Panel)
- Neuroimaging:             767 lines (MRI Atlas + Brain Targets)
- EEG/qEEG:               1,938 lines (qEEG Protocol Fit + EEG Signal)
- Evidence/RAG:           1,948 lines (Evidence RAG + Evidence Intelligence)
- Device Integration:     ~2,000 lines (Device Sync)
- Evidence Bridges:         339 lines (Biomarker + Nutrition Bridge)
```

### 1.2 Active Service Dependencies

```
                    [ API Gateway ]
                          |
        +--------+--------+--------+--------+
        |        |        |        |        |
   [Medication] [Neuro]  [EEG]  [Evidence] [Device]
        |        |        |        |        |
   DrugBank   MRI Atlas qEEG    RAG/Intel  Sync
   OpenFDA   Brain T.  EEG              Wearables
   Analyzer           Signal
```

---

## Section 2: Needed -- Critical Priority

These databases are **blocking features** currently in the product roadmap. Integration should begin immediately.

| Database | Domain | Why Needed | Integration Complexity | Estimated Lines |
|----------|--------|-----------|----------------------|----------------|
| RxNorm | Medication coding | Drug identification, interactions | Medium | 400 |
| ATC Codes | Drug classification | Drug categorization | Low | 200 |
| NDC Database | Drug products | Product identification | Medium | 300 |
| FAERS | Adverse events | Safety monitoring | Medium | 500 |
| PharmGKB API | Pharmacogenomics | Gene-drug interactions | High | 600 |
| ClinVar | Genetic variants | Variant interpretation | High | 500 |
| MNI152 Template | MRI standard | Standard brain template | Low | 100 |
| AAL Atlas | Brain regions | Region labeling | Low | 150 |
| FreeSurfer Atlas | Cortical parcellation | Surface analysis | Medium | 300 |
| Normative EEG DB | qEEG comparison | Age-matched norms | High | 800 |
| PubMed API | Evidence search | Literature retrieval | Medium | 400 |
| ClinicalTrials.gov | Trial registry | Protocol evidence | Medium | 400 |
| NIH PROMIS | Outcome measures | Patient-reported outcomes | Medium | 350 |
| LOINC Codes | Lab tests | Biomarker coding | Medium | 300 |
| USDA FoodData | Nutrition | Food composition | Low | 200 |
| SNOMED CT | Medical coding | Clinical terminology | High | 500 |
| ICD-10-CM/PCS | Diagnosis/procedure | Billing/coding | Low | 150 |
| MedDRA | Adverse events | Safety terminology | Medium | 300 |
| Allen Brain Atlas | Gene expression | Brain gene maps | Medium | 400 |
| NeuroVault | Neuroimaging maps | Sharing brain maps | Low | 200 |

### 2.1 Critical Priority by Domain

```
Medication (5):     RxNorm, ATC, NDC, FAERS, MedDRA
Genomics (3):       PharmGKB, ClinVar, Allen Brain
Neuroimaging (4):   MNI152, AAL, FreeSurfer, NeuroVault
EEG (1):            Normative EEG DB
Evidence (3):       PubMed, ClinicalTrials.gov, PROMIS
Terminology (2):    SNOMED CT, ICD-10-CM/PCS
Nutrition (1):      USDA FoodData
Lab/Biomarker (1):  LOINC Codes
```

### 2.2 Critical Priority Implementation Order

1. **Week 1:** RxNorm, ATC Codes, NDC, ICD-10-CM/PCS, USDA FoodData
2. **Week 2:** FAERS, MedDRA, PubMed API, ClinicalTrials.gov, LOINC
3. **Week 3:** MNI152 Template, AAL Atlas, NeuroVault, FreeSurfer
4. **Week 4:** PharmGKB, ClinVar, Allen Brain Atlas, Normative EEG DB
5. **Week 5:** SNOMED CT, NIH PROMIS, remaining critical items

**Estimated effort:** 5 weeks, ~7,100 LOC

---

## Section 3: Needed -- High Priority

These databases enable **major platform capabilities** and differentiate DeepSynaps from competitors.

| Database | Domain | Why Needed | Complexity | Lines |
|----------|--------|-----------|-----------|-------|
| gnomAD | Population genetics | Allele frequencies | High | 400 |
| Cochrane Library | Systematic reviews | High-quality evidence | Medium | 350 |
| NICE Guidelines | Clinical guidelines | Treatment protocols | Medium | 300 |
| NIH EEG Normative | EEG norms | Age-matched EEG data | High | 600 |
| Schaefer Atlas | Brain parcellation | Functional regions | Low | 150 |
| HCP-MMP1 | Glasser atlas | Multi-modal parcellation | Medium | 250 |
| OpenNeuro | Neuroimaging data | Research datasets | Medium | 300 |
| Neurosynth | Meta-analysis | Automated meta-analysis | Medium | 350 |
| ABIDE | Autism imaging | Clinical reference | Medium | 250 |
| ADNI | Alzheimer's data | Dementia reference | High | 400 |
| PEDro | Physiotherapy evidence | Rehab evidence | Low | 200 |
| 6MWT Norms | Outcome measures | Walking test norms | Low | 150 |
| BDNF Reference | Biomarker | BDNF reference ranges | Medium | 200 |
| HRV Norms | Wearable | Heart rate variability norms | Medium | 250 |
| Withings API | Wearable | Scale/blood pressure data | Low | 150 |
| KEGG Pathways | Genomics | Biological pathways | Medium | 300 |
| OMIM | Genetics | Genetic disorders | Medium | 250 |
| GTEx | Gene expression | Tissue expression | High | 350 |
| GeneCards | Gene info | Gene summaries | Low | 200 |
| dbSNP | Variants | SNP database | High | 400 |

### 3.1 High Priority by Domain

```
Genomics (6):       gnomAD, KEGG, OMIM, GTEx, GeneCards, dbSNP
Neuroimaging (6):   Schaefer, HCP-MMP1, OpenNeuro, Neurosynth, ABIDE, ADNI
Evidence (2):       Cochrane, NICE Guidelines
EEG (1):            NIH EEG Normative
Wearable (2):       HRV Norms, Withings API
Biomarker (1):      BDNF Reference
Outcome Measures (2): PEDro, 6MWT Norms
```

### 3.2 High Priority Implementation Order

1. **Week 1:** Schaefer Atlas, HCP-MMP1, GeneCards, PEDro, 6MWT Norms
2. **Week 2:** Cochrane Library, NICE Guidelines, Neurosynth, BDNF Reference
3. **Week 3:** OpenNeuro, ABIDE, Withings API, HRV Norms
4. **Week 4:** KEGG Pathways, OMIM, GTEx
5. **Week 5:** gnomAD, dbSNP, ADNI, NIH EEG Normative

**Estimated effort:** 5 weeks, ~6,350 LOC

---

## Section 4: Needed -- Medium Priority

These databases provide **enhanced capabilities** and should be integrated after critical and high priority items.

| Database | Domain | Why Needed | Complexity | Lines |
|----------|--------|-----------|-----------|-------|
| UMLS Metathesaurus | Terminology mapping | Cross-code mapping | High | 500 |
| SIDER | Side effects | Drug side effects | Low | 200 |
| OFFSIDES/TWOSIDES | Adverse events | Off-label effects | Medium | 250 |
| ChEBI | Chemical entities | Chemical ontology | Low | 150 |
| PubChem | Chemicals | Chemical database | Medium | 200 |
| 1000 Genomes | Population genetics | Variant frequencies | High | 300 |
| BrainMap | Functional imaging | Activation mapping | Medium | 250 |
| Brainnetome | Brain network | Network parcellation | Low | 150 |
| Juelich Atlas | Cytoarchitectonic | Histological regions | Low | 150 |
| fNIRS Norms | fNIRS | Optical imaging norms | Medium | 400 |
| PsycBITE | Psychology evidence | Psych evidence | Low | 150 |
| SpeechBITE | Speech evidence | Speech therapy | Low | 150 |
| OTseeker | OT evidence | Occupational therapy | Low | 150 |
| NeuroQOL | QoL measures | Quality of life | Medium | 200 |
| RehaCom Norms | Cognition | Cognitive rehab norms | Medium | 200 |
| CANTAB Norms | Cognition | Cambridge cognitive norms | Medium | 200 |
| NHANES | Population health | US health data | High | 350 |
| FoodData Central | Nutrition | USDA food database | Low | 150 |
| DSLD | Supplements | Supplement database | Low | 150 |
| MedWatch | Safety | FDA safety reports | Medium | 200 |

### 4.1 Medium Priority by Domain

```
Terminology (1):    UMLS Metathesaurus
Pharmacovigilance (3): SIDER, OFFSIDES/TWOSIDES, MedWatch
Chemical (2):       ChEBI, PubChem
Genomics (2):       1000 Genomes
Neuroimaging (4):   BrainMap, Brainnetome, Juelich Atlas, fNIRS Norms
Evidence (3):       PsycBITE, SpeechBITE, OTseeker
Outcome Measures (3): NeuroQOL, RehaCom Norms, CANTAB Norms
Population Health (1): NHANES
Nutrition (2):      FoodData Central, DSLD
```

### 4.2 Medium Priority Implementation Order

1. **Week 1:** SIDER, ChEBI, Brainnetome, Juelich Atlas, FoodData Central, DSLD
2. **Week 2:** OFFSIDES/TWOSIDES, PubChem, PsycBITE, SpeechBITE, OTseeker
3. **Week 3:** BrainMap, fNIRS Norms, NeuroQOL, RehaCom Norms, CANTAB Norms
4. **Week 4:** MedWatch, 1000 Genomes, NHANES
5. **Week 5:** UMLS Metathesaurus (requires SNOMED CT first)

**Estimated effort:** 5 weeks, ~5,100 LOC

---

## Section 5: Integration Architecture

### 5.1 Recommended Architecture

```
+------------------------------------------------------------------+
|                    LAYER 4: API ENDPOINTS                        |
|  REST / GraphQL / Role-based access / Audit logging              |
+------------------------------------------------------------------+
    |           |           |           |           |
    v           v           v           v           v
+-------+  +-------+  +-------+  +-------+  +-------+
| Drug  |  | Neuro |  | EEG   |  |Evidence|  |Device |
| API   |  | API   |  | API   |  | API   |  | API   |
+-------+  +-------+  +-------+  +-------+  +-------+
+------------------------------------------------------------------+
|                    LAYER 3: QUERY ENGINE                         |
|  Unified query interface / Cross-database joins                  |
|  Evidence grade tracking / Provenance / Federation               |
+------------------------------------------------------------------+
    |           |           |           |           |
    v           v           v           v           v
+-------+  +-------+  +-------+  +-------+  +-------+
|Unified |  |Cross- |  |Evidence|  |Prove- |  |Result |
|Query  |  |DB Join|  |Grader |  |nance  |  |Cache  |
+-------+  +-------+  +-------+  +-------+  +-------+
+------------------------------------------------------------------+
|                    LAYER 2: LOCAL CACHE/DATABASE                 |
|  SQLite (<1GB) / PostgreSQL (1GB-100GB) / pgvector (vectors)    |
+------------------------------------------------------------------+
    |           |           |           |           |
    v           v           v           v           v
+-------+  +--------+  +-------+  +-------+  +--------+
|SQLite |  |PostgreSQL|  |pgvector|  |Redis  |  |Local  |
|Small  |  |Large    |  |Vector |  |Cache  |  |Files  |
+-------+  +--------+  +-------+  +-------+  +--------+
+------------------------------------------------------------------+
|                    LAYER 1: EXTERNAL API ADAPTERS                |
|  API clients / Rate limiting / Retry logic / Transform           |
+------------------------------------------------------------------+
    |           |           |           |           |
    v           v           v           v           v
+-------+  +-------+  +-------+  +-------+  +-------+
|DrugBank|  |PubMed |  |FDA    |  |NIH    |  |Clinical|
|OpenFDA |  |Trials |  |FAERS  |  |PROMIS |  |Trials |
+-------+  +-------+  +-------+  +-------+  +-------+
```

### 5.2 Caching Strategy

| Data Type | Cache Duration | Rationale | Storage |
|-----------|---------------|-----------|---------|
| Drug data (names, doses) | 24 hours | Changes frequently with recalls | Redis + Local |
| Evidence data (papers, trials) | 1 week | Check for updates weekly | PostgreSQL |
| Normative data (EEG, MRI norms) | 1 month | Rarely changes | Local files + SQLite |
| Genetic data (variants, pathways) | 1 month | Stable reference data | PostgreSQL |
| Trial data (ClinicalTrials.gov) | 3 days | Updates frequently | Redis |
| Atlas data (brain regions) | 1 month | Stable anatomical data | Local files |
| Terminology (SNOMED, ICD-10) | 6 months | Annual releases | PostgreSQL |
| Adverse events (FAERS, MedDRA) | 1 week | Quarterly updates | PostgreSQL |
| Nutrition data (USDA) | 1 month | Annual updates | SQLite |
| Wearable data | 5 minutes | Real-time stream | Redis |

### 5.3 Technology Stack

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

### 5.4 Error Handling & Resilience

```python
# Layer 1: External API Adapter Pattern
class ExternalAPIAdapter:
    """Base adapter for all external database integrations."""

    retry_policy = RetryPolicy(
        max_retries=3,
        backoff_factor=2.0,
        status_forcelist=[429, 500, 502, 503, 504]
    )

    rate_limit = RateLimit(
        requests_per_second=10,
        burst_size=20
    )

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            limits=Limits(max_connections=50)
        )
        self.cache = RedisCache()
        self.metrics = APIMetrics()

    async def fetch_with_fallback(self, query: str) -> dict:
        # 1. Check cache
        if cached := await self.cache.get(query):
            return cached
        # 2. Call external API with retry
        try:
            result = await self._call_with_retry(query)
        except ExternalAPIError:
            # 3. Fallback to local cache/stale data
            result = await self._fallback_to_local(query)
        # 4. Update cache
        await self.cache.set(query, result, ttl=self.cache_ttl)
        return result
```

### 5.5 Database Schema Strategy

```
+------------------------------------------------+
|              DEEP_SYNAPS_MASTER_DB             |
+------------------------------------------------+
|                                                |
|  +------------------+  +------------------+   |
|  | medication_drugs  |  | neuro_atlases    |   |
|  | - drugbank_id     |  | - atlas_id       |   |
|  | - rxnorm_cui      |  | - region_name    |   |
|  | - atc_code        |  | - mni_coords     |   |
|  | - ndc_codes[]     |  | - volume_mm3     |   |
|  | - name_generic    |  +------------------+   |
|  | - name_brand[]    |                         |
|  +------------------+  +------------------+   |
|                         | eeg_normative_data|   |
|  +------------------+  | - age_range       |   |
|  | pharmacogenomics  |  | - band            |   |
|  | - gene_symbol     |  | - electrode       |   |
|  | - rs_id           |  | - mean            |   |
|  | - phenotype       |  | - sd              |   |
|  | - guideline       |  | - n_subjects      |   |
|  | - evidence_level  |  +------------------+   |
|  +------------------+                         |
|                         +------------------+   |
|  +------------------+  | evidence_papers    |   |
|  | genetic_variants  |  | - pmid            |   |
|  | - chrom           |  | - title           |   |
|  | - pos             |  | - abstract_vec    |   |
|  | - ref/alt         |  | - evidence_grade  |   |
|  | - clinvar_sig     |  | - mesh_terms[]    |   |
|  +------------------+  +------------------+   |
|                                                |
|  +------------------+  +------------------+   |
|  | clinical_trials   |  | biomarkers       |   |
|  | - nct_id          |  | - loinc_code     |   |
|  | - title           |  | - name           |   |
|  | - phase           |  | - ref_range      |   |
|  | - status          |  | - unit           |   |
|  | - interventions[] |  | - evidence[]     |   |
|  +------------------+  +------------------+   |
|                                                |
|  +------------------+  +------------------+   |
|  | nutrition_foods   |  | wearable_readings |   |
|  | - fdc_id          |  | - device_id       |   |
|  | - name            |  | - timestamp       |   |
|  | - nutrients[]     |  | - hr, hrv, bp     |   |
|  | - serving_size    |  | - steps, weight   |   |
|  +------------------+  +------------------+   |
|                                                |
|  +------------------+  +------------------+   |
|  | terminology_map   |  | cache_entries     |   |
|  | - source_system   |  | - key             |   |
|  | - source_code     |  | - value_json      |   |
|  | - target_system   |  | - ttl             |   |
|  | - target_code     |  | - created_at      |   |
|  +------------------+  +------------------+   |
|                                                |
+------------------------------------------------+
```

---

## Section 6: Implementation Roadmap

### 6.1 Phase 1: Critical Priority (Weeks 1--5)

```
Week 1: [Terminology Foundation]
  - RxNorm API adapter
  - ATC code importer
  - NDC database downloader
  - ICD-10-CM/PCS lookup service
  - USDA FoodData Central API

Week 2: [Safety & Evidence Core]
  - FAERS quarterly data importer
  - MedDRA terminology mapper
  - PubMed E-utilities API
  - ClinicalTrials.gov API
  - LOINC code lookup

Week 3: [Neuroimaging Standards]
  - MNI152 template loader
  - AAL atlas region mapper
  - NeuroVault API client
  - FreeSurfer annotation reader

Week 4: [Genomics Integration]
  - PharmGKB API client
  - ClinVar VCF parser
  - Allen Brain Atlas API
  - Normative EEG DB importer

Week 5: [Advanced Terminology]
  - SNOMED CT terminology service
  - NIH PROMIS measure API
  - Integration testing
  - Documentation
```

### 6.2 Phase 2: High Priority (Weeks 6--10)

```
Week 6: [Atlases & Basic Evidence]
  - Schaefer Atlas parcellation
  - HCP-MMP1 (Glasser) atlas
  - GeneCards API integration
  - PEDro evidence scraper
  - 6MWT normative data

Week 7: [Evidence & Biomarkers]
  - Cochrane Library API
  - NICE Guidelines scraper
  - Neurosynth meta-analysis API
  - BDNF reference ranges

Week 8: [Imaging Datasets]
  - OpenNeuro dataset browser
  - ABIDE reference data
  - Withings API integration
  - HRV normative database

Week 9: [Genomics Deep Dive]
  - KEGG pathway mapper
  - OMIM gene-disease links
  - GTEx tissue expression

Week 10: [Advanced Genomics]
  - gnomAD allele frequencies
  - dbSNP variant lookup
  - ADNI reference data
  - NIH EEG normative data
```

### 6.3 Phase 3: Medium Priority (Weeks 11--15)

```
Week 11: [Pharmacovigilance & Basic]
  - SIDER side effects
  - ChEBI chemical ontology
  - Brainnetome parcellation
  - Juelich cytoarchitectonic atlas

Week 12: [Evidence Extensions]
  - OFFSIDES/TWOSIDES adverse events
  - PubChem compound lookup
  - PsycBITE evidence
  - SpeechBITE evidence
  - OTseeker evidence

Week 13: [Outcome Measures]
  - NeuroQOL measures
  - RehaCom normative data
  - CANTAB normative data
  - fNIRS normative data

Week 14: [Population & Nutrition]
  - NHANES data downloader
  - FoodData Central deep integration
  - DSLD supplement database
  - MedWatch safety reports

Week 15: [Advanced Mapping]
  - UMLS Metathesaurus crosswalk
  - Integration testing
  - Performance optimization
```

### 6.4 Phase 4: Advanced Features (Weeks 16--17)

```
Week 16: [Vector Search & RAG]
  - pgvector setup for all evidence DBs
  - Embedding pipeline for PubMed abstracts
  - Cross-database similarity search
  - Evidence-grade-aware ranking

Week 17: [Cross-Database Joins]
  - Unified query planner
  - Cross-database JOIN engine
  - Provenance tracking
  - Audit logging
  - Performance benchmarking
```

---

## Section 7: File Naming Convention

All new integration files must follow this convention:

```
{DATABASE_NAME}_{type}.py

Types:
  - _client.py      : External API client
  - _importer.py    : Local data importer/downloader
  - _service.py     : Business logic service
  - _models.py      : SQLAlchemy/Pydantic models
  - _router.py      : FastAPI endpoint router
  - _cache.py       : Caching layer
  - _test.py        : Unit + integration tests

Examples:
  - rxnorm_client.py
  - faers_importer.py
  - mni152_service.py
  - clinvar_models.py
  - pubmed_router.py
```

---

## Section 8: API Endpoint Design

All database integrations expose a consistent REST API:

```
/api/v1/drug/           - DrugBank, RxNorm, ATC, NDC
/api/v1/safety/         - FAERS, MedDRA, SIDER
/api/v1/genomics/       - PharmGKB, ClinVar, gnomAD, dbSNP
/api/v1/neuro/          - MRI atlases, fNIRS norms
/api/v1/eeg/            - EEG signal, normative data
/api/v1/evidence/       - PubMed, Cochrane, ClinicalTrials.gov
/api/v1/biomarker/      - LOINC, BDNF, HRV norms
/api/v1/nutrition/      - USDA FoodData, supplements
/api/v1/terminology/    - SNOMED CT, ICD-10, UMLS
/api/v1/outcome/        - PROMIS, NeuroQOL, 6MWT norms
/api/v1/wearable/       - Device sync, Withings API
```

---

## Section 9: Quality Standards

All integrations must meet these standards before merging:

| Requirement | Standard |
|-------------|----------|
| Test coverage | >= 80% |
| Type hints | 100% coverage |
| Pydantic models | All request/response |
| Async support | All I/O operations |
| Error handling | Custom exceptions + structured errors |
| Rate limiting | All external APIs |
| Cache headers | All endpoints |
| Documentation | OpenAPI + README |
| Metrics | Prometheus counters for all calls |
| Audit log | All data access logged |

---

## Section 10: Summary & Key Metrics

### Database Count by Status

| Status | Count | Estimated LOC |
|--------|-------|---------------|
| Already Integrated (ACTIVE) | 13 | 12,081 |
| Critical Priority (NEEDED) | 20 | 7,100 |
| High Priority (NEEDED) | 20 | 6,350 |
| Medium Priority (NEEDED) | 20 | 5,100 |
| **TOTAL** | **73** | **~30,631** |

### Database Count by Domain

| Domain | Active | Critical | High | Medium | Total |
|--------|--------|----------|------|--------|-------|
| Medication | 3 | 5 | 0 | 0 | 8 |
| Safety/Pharmacovigilance | 0 | 2 | 0 | 3 | 5 |
| Pharmacogenomics | 1 | 1 | 6 | 2 | 10 |
| Neuroimaging | 2 | 4 | 6 | 4 | 16 |
| EEG/qEEG | 2 | 1 | 1 | 1 | 5 |
| Evidence/Literature | 2 | 2 | 2 | 3 | 9 |
| Terminology/Coding | 0 | 2 | 0 | 1 | 3 |
| Biomarkers/Labs | 0 | 1 | 1 | 0 | 2 |
| Nutrition | 1 | 1 | 0 | 2 | 4 |
| Outcome Measures | 0 | 1 | 2 | 3 | 6 |
| Wearables/Devices | 1 | 0 | 2 | 0 | 3 |
| Genetics/Genomics | 0 | 1 | 6 | 1 | 8 |
| Population Health | 0 | 0 | 0 | 1 | 1 |
| **TOTAL** | **12*** | **20** | **20** | **20** | **73** |

> *Medication Analyzer is an internal service combining multiple data sources.

### Implementation Timeline

| Phase | Duration | Databases | LOC |
|-------|----------|-----------|-----|
| Phase 1: Critical | Weeks 1--5 | 20 | 7,100 |
| Phase 2: High | Weeks 6--10 | 20 | 6,350 |
| Phase 3: Medium | Weeks 11--15 | 20 | 5,100 |
| Phase 4: Advanced | Weeks 16--17 | N/A | N/A |
| **TOTAL** | **17 weeks** | **60 new** | **~18,550** |

### Engineering Resource Estimate

| Resource | FTE | Duration |
|----------|-----|----------|
| Senior Backend Engineer | 1.0 | 17 weeks |
| Data Integration Engineer | 1.0 | 17 weeks |
| DevOps/DB Engineer | 0.5 | 8 weeks (Phase 4) |
| QA Engineer | 0.5 | 8 weeks (overlapping) |

---

## Appendix A: External API Reference Links

| Database | API URL | Auth Type | Rate Limit |
|----------|---------|-----------|------------|
| DrugBank | https://docs.drugbank.com | API Key | 1,000/day (free) |
| OpenFDA | https://api.fda.gov | None | 240/min |
| RxNorm | https://rxnav.nlm.nih.gov | None | Fair use |
| FAERS | https://open.fda.gov | None | 240/min |
| PharmGKB | https://api.pharmgkb.org | API Key | 5,000/day |
| ClinVar | https://eutils.ncbi.nlm.nih.gov | API Key | 3/sec |
| PubMed | https://eutils.ncbi.nlm.nih.gov | API Key | 10/sec (with key) |
| ClinicalTrials.gov | https://clinicaltrials.gov/api | None | 500/min |
| Allen Brain Atlas | https://api.brain-map.org | None | Fair use |
| NeuroVault | https://neurovault.org/api | None | Fair use |
| USDA FoodData | https://api.nal.usda.gov | API Key | 3,600/hour |
| SNOMED CT | https://terminology.hl7.org | UMLS License | Varies |
| gnomAD | https://gnomad.broadinstitute.org | None | Fair use |
| GTEx | https://gtexportal.org | None | Fair use |
| Cochrane | https://www.cochranelibrary.com | Subscription | Varies |

## Appendix B: Local Data Storage Requirements

| Database | Size | Storage | Format |
|----------|------|---------|--------|
| DrugBank (full) | ~2 GB | PostgreSQL | SQL dump |
| RxNorm (monthly) | ~500 MB | PostgreSQL | UMLS RRF |
| FAERS (quarterly) | ~1 GB/quarter | PostgreSQL | CSV |
| ClinVar (VCF) | ~500 MB | PostgreSQL | VCF |
| Normative EEG DB | ~200 MB | SQLite | Custom |
| MNI152 Template | ~50 MB | Files | NIfTI |
| AAL Atlas | ~20 MB | Files + SQLite | NIfTI + TSV |
| Schaefer Atlas | ~30 MB | Files | NIfTI |
| PubMed abstracts (subset) | ~5 GB | pgvector | JSON + vectors |
| USDA FoodData | ~100 MB | SQLite | JSON |
| SNOMED CT | ~2 GB | PostgreSQL | RF2 |
| 1000 Genomes | ~50 GB | Files | VCF |
| **Total (all local)** | **~62 GB** | **Mixed** | **Multiple** |

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| AAL | Automated Anatomical Labeling atlas |
| ABIDE | Autism Brain Imaging Data Exchange |
| ADNI | Alzheimer's Disease Neuroimaging Initiative |
| ATC | Anatomical Therapeutic Chemical classification |
| BDNF | Brain-Derived Neurotrophic Factor |
| ChEBI | Chemical Entities of Biological Interest |
| DSLD | Dietary Supplement Label Database |
| FAERS | FDA Adverse Event Reporting System |
| fNIRS | functional Near-Infrared Spectroscopy |
| GTEx | Genotype-Tissue Expression project |
| HCP-MMP1 | Human Connectome Project Multi-Modal Parcellation |
| ICD-10-CM | International Classification of Diseases, 10th Revision, Clinical Modification |
| LOINC | Logical Observation Identifiers Names and Codes |
| MedDRA | Medical Dictionary for Regulatory Activities |
| MNI152 | Montreal Neurological Institute 152 template |
| NDC | National Drug Code |
| NHANES | National Health and Nutrition Examination Survey |
| NIfTI | Neuroimaging Informatics Technology Initiative |
| OMIM | Online Mendelian Inheritance in Man |
| pgvector | PostgreSQL extension for vector similarity search |
| PGx | Pharmacogenomics |
| PROMIS | Patient-Reported Outcomes Measurement Information System |
| qEEG | Quantitative Electroencephalography |
| RAG | Retrieval-Augmented Generation |
| RF2 | Release Format 2 (SNOMED CT) |
| RxNorm | Normalized names for clinical drugs |
| SNOMED CT | Systematized Nomenclature of Medicine Clinical Terms |
| UMLS | Unified Medical Language System |
| VCF | Variant Call Format |
| 6MWT | 6-Minute Walk Test |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-01-20 | Research Engineering | Initial release |

## Next Review

This document will be reviewed and updated **weekly** on Mondays. Changes should be submitted via pull request with review from the Research Engineering Lead.

---

*DeepSynaps Protocol Studio -- Research Division*
*Confidential -- Internal Use Only*
