# Batch 3 Evidence/Literature Database Integration Report

## Summary

| Adapter | Database | Records | Confidence Tier | Auth Required | Rate Limit |
|---------|----------|---------|-----------------|---------------|------------|
| `PubMedAdapter` | PubMed/MEDLINE | 35M+ | B | Optional (API key) | 3/s (no key), 10/s (key) |
| `CochraneAdapter` | Cochrane Library | ~10K reviews | A | No | ~2/sec |
| `ClinicalTrialsAdapter` | ClinicalTrials.gov | 400K+ | A | No | ~1/sec |
| `EuropePMCAdapter` | Europe PMC | 40M+ | B | No | ~1000/min |
| `NICEAdapter` | NICE Evidence | ~1K guidelines | A | No | ~2/sec |

---

## 1. PubMed/MEDLINE Adapter (`pubmed_adapter.py`)

### API Details
- **Base URL**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- **Documentation**: https://www.ncbi.nlm.nih.gov/books/NBK25499/
- **Database Size**: 35+ million biomedical citations
- **Data Coverage**: 1966-present

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `einfo.fcgi` | GET | Connection validation |
| `esearch.fcgi` | GET | Search for PMIDs |
| `esummary.fcgi` | GET | Fetch document summaries |
| `efetch.fcgi` | GET | Fetch abstracts (XML) |
| `elink.fcgi` | GET | Related articles |

### Rate Limiting
- Without API key: **3 requests/second**
- With API key: **10 requests/second**
- Implemented via `asyncio.Semaphore` + inter-request delay
- Respects NCBI's rate-limiting guidelines

### Sample Queries
```python
adapter = PubMedAdapter(api_key="your_ncbi_key")

# Basic search
results = await adapter.search("diabetes mellitus treatment")

# Search with filters
results = await adapter.search(
    "depression antidepressants",
    filters={
        "max_results": 10,
        "date_from": "2023/01/01",
        "date_to": "2024/12/31",
        "publication_type": ["Randomized Controlled Trial"],
        "sort": "relevance",
    }
)

# Fetch abstract for a specific PMID
abstract = await adapter.fetch_abstract("12345678")

# Get related articles
related = await adapter.fetch_related("12345678", max_results=5)
```

### Evidence Grade Mapping
| PubMed Publication Type | Grade |
|------------------------|-------|
| Systematic Review, Meta-Analysis | A |
| Randomized Controlled Trial | A |
| Practice Guideline, Consensus | A |
| Clinical Trial, Controlled Clinical Trial | B |
| Review | B |
| Case Reports | C |
| Default (letters, editorials) | C |

---

## 2. Cochrane Library Adapter (`cochrane_adapter.py`)

### API Details
- **Base URL**: `https://www.cochranelibrary.com/` + `https://export.cochrane.org/`
- **Documentation**: https://www.cochranelibrary.com/about/api
- **Database Size**: ~10,000 systematic reviews + protocols
- **Data Coverage**: 1993-present

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `cochranelibrary.com/` | GET | Connection validation |
| `cochranelibrary.com/search` | GET | Search reviews |
| `export.cochrane.org/api/review/{doi}` | GET | Review detail |

### Rate Limiting
- **~2 requests/second** (conservative)
- Implemented via `asyncio.Semaphore(2)`

### Sample Queries
```python
adapter = CochraneAdapter()

# Search systematic reviews
results = await adapter.search("depression cognitive behavioral therapy")

# Search with filters
results = await adapter.search(
    "type 2 diabetes",
    filters={
        "max_results": 10,
        "product": "cdsr",           # Cochrane Database of Systematic Reviews
        "review_type": "review",
        "sort": "relevance",
    }
)

# Fetch a specific review by DOI
review = await adapter.fetch_review_by_doi("10.1002/14651858.CD012345.pub2")
```

### Confidence Scoring
- Cochrane reviews receive **overall >= 0.90**
- Evidence strength: **0.95-0.98** (peer-reviewed systematic reviews)
- All Cochrane reviews are graded **A**

---

## 3. ClinicalTrials.gov Adapter (`clinicaltrials_adapter.py`)

### API Details
- **Base URL**: `https://clinicaltrials.gov/api/v2/`
- **Documentation**: https://clinicaltrials.gov/data-api/api
- **Database Size**: 400,000+ registered trials
- **Data Coverage**: 1999-present

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/version` | GET | Connection validation |
| `/studies` | GET | Search trials |
| `/studies/{nctId}` | GET | Single trial detail |
| `/stats` | GET | Registry statistics |

### Rate Limiting
- **~1 request/second** (no key required)
- Implemented via `asyncio.Semaphore(1)` + 1-second minimum interval

### Sample Queries
```python
adapter = ClinicalTrialsAdapter()

# Search by condition
results = await adapter.search("major depressive disorder")

# Search with filters
results = await adapter.search(
    "alzheimer disease",
    filters={
        "max_results": 20,
        "status": "RECRUITING",
        "phase": "PHASE2|PHASE3",
        "study_type": "INTERVENTIONAL",
        "has_results": True,
        "location": "United States",
    }
)

# Fetch specific trial
trial = await adapter.fetch_study("NCT04292899")

# Get registry statistics
stats = await adapter.get_statistics()
```

### Trial Confidence Factors
| Factor | Impact |
|--------|--------|
| Phase 3 | Evidence strength = 0.95 |
| Phase 2 | Evidence strength = 0.85 |
| Phase 1 | Evidence strength = 0.60 |
| Has results | +data_quality |
| Randomized | +data_quality |
| Enrollment >= 1000 | Sample size = 0.95 |
| Completed + results | Replication = 0.85 |

---

## 4. Europe PMC Adapter (`europepmc_adapter.py`)

### API Details
- **Base URL**: `https://www.ebi.ac.uk/europepmc/webservices/rest/`
- **Documentation**: https://europepmc.org/RestfulWebService
- **Database Size**: 40+ million articles (PubMed + PMC + others)
- **Data Coverage**: Full MEDLINE + open access literature

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/profile` | GET | Connection validation |
| `/search` | GET | Search publications |
| `/references/MED/{pmid}` | GET | Reference list |
| `/citations/MED/{pmid}` | GET | Citing articles |
| `/{pmcid}/fullTextXML` | GET | Full-text XML |

### Rate Limiting
- **~1000 requests/minute** (generous EBI limit)
- Implemented via `asyncio.Semaphore(10)` + 0.06s minimum interval

### Sample Queries
```python
adapter = EuropePMCAdapter()

# Basic search
results = await adapter.search("stroke rehabilitation")

# Search with filters
results = await adapter.search(
    "covid-19 vaccine",
    filters={
        "max_results": 25,
        "date_from": "2023-01-01",
        "date_to": "2024-12-31",
        "sort": "Date",
        "has_ft": True,
        "author": "Smith",
    }
)

# Fetch references
refs = await adapter.fetch_references("12345678")

# Fetch citing articles
citations = await adapter.fetch_citations("12345678")

# Fetch full-text (PMCID required)
xml = await adapter.fetch_fulltext("PMC1234567")
```

### Open Access Features
| Feature | Field | Description |
|---------|-------|-------------|
| Full-text available | `hasFT` | Y/N flag |
| Open access | `isOpenAccess` | Y/N flag |
| In Europe PMC | `inEPMC` | Y/N flag |
| In PubMed Central | `inPMC` | Y/N flag |

### Evidence Grade Mapping
| Publication Type | Grade |
|-----------------|-------|
| Systematic Review, Meta-Analysis | A |
| Randomized Controlled Trial | A |
| Clinical Trial | A |
| Review | B |
| Research Article | B |
| Preprint | C |
| Book | C |

---

## 5. NICE Evidence Adapter (`nice_adapter.py`)

### API Details
- **Base URL**: `https://www.nice.org.uk/` + `https://www.evidence.nhs.uk/`
- **Documentation**: https://www.nice.org.uk/guidance/published
- **Database Size**: ~1,000 active guidelines
- **Data Coverage**: 1999-present (UK-focused)

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `nice.org.uk/guidance` | GET | Connection validation |
| `nice.org.uk/guidance/published` | GET | Search guidance |
| `evidence.nhs.uk/api/search` | GET | NHS Evidence search |
| `nice.org.uk/guidance/{id}` | GET | Guidance detail |

### Rate Limiting
- **~2 requests/second**
- Implemented via `asyncio.Semaphore(3)` + 0.5s minimum interval

### Sample Queries
```python
adapter = NICEAdapter()

# Search NICE guidance
results = await adapter.search("type 2 diabetes")

# Search with filters
results = await adapter.search(
    "depression",
    filters={
        "max_results": 10,
        "guidance_type": "cg",        # Clinical guidelines
        "status": "published",
        "sort": "date",
    }
)

# Search NHS Evidence API
results = await adapter.search(
    "hypertension",
    filters={"api_source": "evidence_nhs", "max_results": 10}
)

# Fetch specific guidance detail
detail = await adapter.fetch_guidance_detail("NG28")

# List available guidance types
types = await adapter.get_guidance_types()
```

### NICE Guidance Types
| Code | Type | Evidence Strength |
|------|------|------------------|
| `ng` | NICE guideline | 0.96 |
| `cg` | Clinical guideline | 0.96 |
| `ta` | Technology appraisal | 0.97 |
| `ip` | Interventional procedures | 0.94 |
| `dg` | Diagnostics guidance | 0.93 |
| `mtg` | Medical technologies guidance | 0.95 |
| `hst` | Highly specialised technologies | 0.95 |
| `es` | Evidence summary | 0.94 |
| `qs` | Quality standard | 0.95 |
| `ph` | Public health guideline | 0.95 |

---

## Canonical EvidenceEntry Schema

All adapters produce consistent canonical output:

```python
{
    "entity_type": "evidence_entry",
    "source_database": "pubmed|cochrane_library|clinicaltrials_gov|europepmc|nice",
    "source_id": "PMID / DOI / NCT ID / NICE ID",
    "title": "Article or Guideline Title",
    "abstract": "Abstract text or summary",
    "evidence_grade": "A|B|C",
    "confidence": {
        "data_quality": 0.0-1.0,
        "evidence_strength": 0.0-1.0,
        "sample_size": 0.0-1.0,
        "replication": 0.0-1.0,
        "consistency": 0.0-1.0,
        "temporal_relevance": 0.0-1.0,
        "population_match": 0.0-1.0,
        "overall": 0.0-1.0,
    },
    "provenance": {
        "source_database": "...",
        "source_version": "...",
        "source_url": "...",
        "retrieved_at": "ISO-8601 timestamp",
        "confidence_tier": "A|B|C",
        "data_quality_score": 0.0-1.0,
        "research_only": False,
        # ... adapter-specific fields
    },
    "url": "Canonical URL",
    "raw_data": { ... },  # Original API response
}
```

---

## Test Coverage

| Test Class | Tests | Coverage |
|-----------|-------|----------|
| `TestPubMedAdapter` | 10 | Connection, search, transform, abstract, related |
| `TestCochraneAdapter` | 8 | Connection, search, transform, fetch by DOI |
| `TestClinicalTrialsAdapter` | 11 | Connection, search, transform, phases, fetch |
| `TestEuropePMCAdapter` | 10 | Connection, search, transform, refs, citations, fulltext |
| `TestNICEAdapter` | 12 | Connection, search, transform, types, guidance detail |
| `TestCrossAdapterConsistency` | 6 | Base inheritance, attributes, schema, confidence, provenance |

**Total: 57 tests** -- All mock HTTP responses; no real API calls.

---

## Running the Tests

```bash
# Install dependencies
pip install httpx pytest pytest-asyncio

# Run all tests
cd /mnt/agents/output/batch3
pytest test_batch3_evidence.py -v

# Run specific adapter tests
pytest test_batch3_evidence.py::TestPubMedAdapter -v
pytest test_batch3_evidence.py::TestClinicalTrialsAdapter -v

# Run with coverage
pytest test_batch3_evidence.py --cov=. --cov-report=term-missing
```

---

## Files Created

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `pubmed_adapter.py` | ~450 | PubMed/MEDLINE NCBI E-utilities adapter |
| 2 | `cochrane_adapter.py` | ~350 | Cochrane Library adapter |
| 3 | `clinicaltrials_adapter.py` | ~420 | ClinicalTrials.gov API v2 adapter |
| 4 | `europepmc_adapter.py` | ~430 | Europe PMC REST API adapter |
| 5 | `nice_adapter.py` | ~460 | NICE Evidence / Guidelines adapter |
| 6 | `test_batch3_evidence.py` | ~700 | Comprehensive test suite (57 tests) |
| 7 | `BATCH3_EVIDENCE_INTEGRATION_REPORT.md` | ~350 | This integration report |

---

*Generated for DeepSynaps Protocol Studio - Batch 3 of 6 Evidence/Literature Adapters*
