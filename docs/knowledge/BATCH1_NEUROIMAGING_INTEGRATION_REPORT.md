# Batch 1 Neuroimaging Integration Report

**Date:** 2024
**Version:** 1.0
**Scope:** 5 P0 Free/Open Neuroimaging Database Adapters

---

## Table of Contents

1. [Overview](#1-overview)
2. [Adapter Summary](#2-adapter-summary)
3. [NeuroVault Adapter](#3-neurovault-adapter)
4. [HCP Young Adult Adapter](#4-hcp-young-adult-adapter)
5. [OpenNeuro Adapter](#5-openneuro-adapter)
6. [OASIS Adapter](#6-oasis-adapter)
7. [HCP Aging Adapter](#7-hcp-aging-adapter)
8. [Cross-Adapter Comparison](#8-cross-adapter-comparison)
9. [Rate Limiting Strategy](#9-rate-limiting-strategy)
10. [Error Handling Matrix](#10-error-handling-matrix)
11. [Canonical Schema Mapping](#11-canonical-schema-mapping)
12. [Testing Summary](#12-testing-summary)

---

## 1. Overview

This report documents the integration of 5 P0 free/open neuroimaging databases into the clinical knowledge platform via FastAPI-compatible adapter classes. Each adapter follows the `BaseAdapter` interface contract and provides:

- **Connection validation** - Health-check endpoint probing
- **Search** - Query the external database with optional filters
- **Canonical transformation** - Map external schemas to `CanonicalClinicalRecord`
- **Provenance tracking** - Full data lineage and quality metadata
- **Confidence scoring** - 7-dimensional quality assessment per record

### Databases Integrated

| # | Database | Records | Modality | Tier | Auth |
|---|----------|---------|----------|------|------|
| 1 | NeuroVault | 200,000+ maps | Statistical (fMRI/PET/VBM) | B | None |
| 2 | HCP Young Adult | 1,200 subjects | sMRI/fMRI/dMRI/MEG | A | API Key |
| 3 | OpenNeuro | 500+ datasets | Multi-modal BIDS | B | None |
| 4 | OASIS | 2,600+ sessions | sMRI/PET/Clinical | A | Basic |
| 5 | HCP Aging | 725+ subjects | sMRI/fMRI/dMRI | A | API Key |

---

## 2. Adapter Summary

### File Structure

```
batch1/
|-- neurovault_adapter.py      # NeuroVault REST API adapter
|-- hcp_adapter.py             # HCP Young Adult adapter
|-- openneuro_adapter.py       # OpenNeuro GraphQL adapter
|-- oasis_adapter.py           # OASIS XNAT adapter
|-- hcp_aging_adapter.py       # HCP-Aging Lifespan adapter
|-- test_batch1_neuroimaging.py # Comprehensive test suite
|-- BATCH1_NEUROIMAGING_INTEGRATION_REPORT.md  # This document
```

### Common Interface

All 5 adapters implement these methods:

| Method | Purpose | Returns |
|--------|---------|---------|
| `__init__()` | Initialize metadata, HTTP client | None |
| `validate_connection()` | Test API reachability | `bool` |
| `search(query, filters)` | Execute search query | `List[Dict]` |
| `transform_to_canonical(raw, entity_type)` | Map to canonical schema | `Dict` |
| `get_provenance(result)` | Get data lineage | `Dict` |
| `get_confidence_score(result)` | 7D quality score | `Dict[str, float]` |
| `close()` | Cleanup resources | `None` |

---

## 3. NeuroVault Adapter

**File:** `neurovault_adapter.py`

### API Details

- **Base URL:** `https://neurovault.org/api/`
- **Protocol:** REST JSON
- **Authentication:** None required
- **Rate Limit:** ~100 req/min (client-enforced)
- **Documentation:** https://neurovault.org/api-docs

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/atlases/` | GET | Health check / atlas listing |
| `/api/images/` | GET | Search statistical maps |
| `/api/collections/` | GET | Search collections |

### Query Parameters

```python
# Image search
GET /api/images/?limit=50&modality=fMRI-BOLD&map_type=Z&collection=287

# Collection search
GET /api/collections/?DOI=10.1016/j.neurobiolaging.2012.11.002

# Atlas query
GET /api/atlases/atlas_query_region/?region=middle%20frontal%20gyrus
```

### Filter Options

```python
{
    "search_type": "images",          # "images" | "collections" | "atlases"
    "modality": "fMRI-BOLD",          # "fMRI-BOLD" | "VBM" | "PET" | ...
    "map_type": "Z",                  # "Z" | "T" | "F" | "beta" | "V" | "P" | "IP" | "M" | "other"
    "collection_id": 287,             # Filter by collection
    "limit": 50,                      # Max results
}
```

### Sample Queries

```python
adapter = NeurovaultAdapter()

# Search for working memory statistical maps
results = await adapter.search("working memory", {
    "search_type": "images",
    "modality": "fMRI-BOLD",
    "map_type": "Z",
    "limit": 20
})

# Search for atlases
results = await adapter.search("Harvard-Oxford", {
    "search_type": "atlases",
    "limit": 10
})
```

### Canonical Mapping

| NeuroVault Field | Canonical Field |
|------------------|-----------------|
| `id` | `source_id` |
| `name` | `name` |
| `modality` | `modality` |
| `map_type` | `value.map_type` |
| `cognitive_paradigm_cogatlas` | `value.cognitive_info.paradigm` |
| `number_of_subjects` | `value.number_of_subjects` |
| `not_mni` | `value.spatial_info.mni_space` |

### Confidence Scoring

Tier B (user-uploaded, variable quality). Scores adjusted by:
- MNI space conformity
- Subject count
- Map type specificity (Z/T preferred)
- Group-level vs single-subject

---

## 4. HCP Young Adult Adapter

**File:** `hcp_adapter.py`

### API Details

- **Portal URL:** `https://db.humanconnectome.org/`
- **Data Source:** ConnectomeDB REST API
- **Authentication:** Free registration required (API key)
- **Rate Limit:** 60 req/min
- **Documentation:** https://www.humanconnectome.org/software/connectomedb

### Data Release

- **Release:** S1200 (1,200+ subjects)
- **Age Range:** 22-35 years
- **Population:** Healthy young adults
- **Scanner:** Siemens 3T Connectome Skyra

### Modalities Available

| Code | Description | Subjects |
|------|-------------|----------|
| T1w | T1-weighted structural | 1,206 |
| T2w | T2-weighted structural | 1,206 |
| rfMRI | Resting-state fMRI | 1,206 |
| tfMRI | Task fMRI | 1,206 |
| dMRI | Diffusion MRI | 1,206 |
| MEG | Magnetoencephalography | ~100 |

### Task fMRI Paradigms

- EMOTION, GAMBLING, LANGUAGE, MOTOR, RELATIONAL, SOCIAL, WM

### Sample Queries

```python
adapter = HcpAdapter(api_key="your_key")

# Search for subject
results = await adapter.search("100206", {"search_type": "subjects"})

# List all modalities
results = await adapter.search("*", {"search_type": "modalities"})

# Search task
results = await adapter.search("WM", {"search_type": "tasks"})
```

### Canonical Mapping

| HCP Field | Canonical Field |
|-----------|-----------------|
| `subject_id` | `subject_id` |
| `modality_code` | `modality` |
| `description` | `name` |
| `preprocessing_pipeline` | `value.preprocessing` |
| `subjects_available` | `value.subjects_available` |

### Confidence Scoring

Tier A (rigorously curated). High scores across all dimensions:
- Data quality: 0.95
- Standardized preprocessing
- Large N (1,200+)
- Replication: 0.90

---

## 5. OpenNeuro Adapter

**File:** `openneuro_adapter.py`

### API Details

- **Portal URL:** `https://openneuro.org/`
- **GraphQL Endpoint:** `https://openneuro.org/crn/graphql`
- **Protocol:** GraphQL over HTTP
- **Authentication:** None required (optional for uploads)
- **Rate Limit:** 60 req/min
- **Documentation:** https://docs.openneuro.org/api.html

### GraphQL Schema

```graphql
type Query {
    datasets(first: Int, filter: String, modality: String): DatasetConnection
    dataset(id: ID!): Dataset
    snapshot(datasetId: ID!, tag: String): Snapshot
}

type Dataset {
    id: ID!
    draft: Draft
}

type Draft {
    id: ID!
    description: Description
    summary: Summary
    readme: String
    created: String
    modified: String
}

type Summary {
    modalities: [String]
    tasks: [String]
    subjectMetadata: [SubjectMetadata]
    totalFiles: Int
    size: Float
}

type SubjectMetadata {
    participantId: String
    age: Float
    sex: String
    group: String
}
```

### Sample GraphQL Queries

```python
adapter = OpenneuroAdapter()

# Search datasets
results = await adapter.search("face perception", {"limit": 10})

# Get specific dataset
results = await adapter.search("ds000001", {"limit": 1})

# Search with modality filter
results = await adapter.search("*", {
    "limit": 20,
    "modality": "MRI"
})

# Get dataset files
files = await adapter.get_dataset_files("ds000001", "1.0.0")
```

### Canonical Mapping

| OpenNeuro Field | Canonical Field |
|-----------------|-----------------|
| `id` | `source_id` |
| `description.Name` | `name` |
| `description.DatasetDOI` | `doi` |
| `description.Authors` | `authors` |
| `description.License` | `license` |
| `summary.modalities` | `modalities` |
| `summary.tasks` | `tasks` |
| `summary.subjectMetadata` | `value.subjects` |
| `summary.totalFiles` | `value.total_files` |
| `summary.size` | `value.size_bytes` |

### Confidence Scoring

Tier B (community uploaded). Scores vary by:
- BIDS validation status
- Subject count
- DOI presence
- Modality diversity

---

## 6. OASIS Adapter

**File:** `oasis_adapter.py`

### API Details

- **Portal URL:** `https://www.oasis-brains.org/`
- **XNAT Central:** `https://central.xnat.org/`
- **Protocol:** XNAT REST API / HTTP download
- **Authentication:** Free registration (Basic auth)
- **Rate Limit:** 60 req/min
- **Download scripts:** https://github.com/NrgXnat/oasis-scripts

### Available Projects

| Project | Name | Subjects | Age Range | Modalities |
|---------|------|----------|-----------|------------|
| OASIS-1 | Cross-Sectional | 416 | 18-96 | T1w |
| OASIS-2 | Longitudinal | 150 | 60-96 | T1w |
| OASIS-3 | Longitudinal Multi-modal | 1,378 | 42-95 | T1w, T2w, FLAIR, ASL, SWI, PET |
| OASIS-4 | Clinical Cohort | 663 | 65-90+ | T1w, FLAIR, amyloid PET, tau PET |

### Clinical Data Available

- CDR (Clinical Dementia Rating) global score
- Neuropsychological assessments (NACC UDS v2/v3)
- Demographics
- ApoE genotype
- Braak staging (for AV1451 PET)

### Sample Queries

```python
adapter = OasisAdapter(username="user", password="pass")

# List all projects
results = await adapter.search("*", {"search_type": "projects"})

# Search for specific project
results = await adapter.search("OASIS3", {"search_type": "projects"})

# Search for subject
results = await adapter.search("OAS30001", {
    "search_type": "subjects",
    "project": "OASIS3"
})

# Filter by age range
results = await adapter.search("subjects", {
    "search_type": "subjects",
    "project": "OASIS3",
    "age_min": 65,
    "age_max": 85
})
```

### Canonical Mapping

| OASIS Field | Canonical Field |
|-------------|-----------------|
| `project_id` | `project` |
| `subject_id` | `source_id` |
| `xnat_url` | `source_url` |
| `modalities` | `value.available_modalities` |
| `has_clinical_data` | `value.clinical_info.has_clinical_data` |
| `cdr_global` | `value.clinical_info.cdr_global` |
| `diagnosis` | `value.clinical_info.diagnosis` |

### Confidence Scoring

Tier A (longitudinal, well-curated). High scores driven by:
- Longitudinal design (follow-up scans)
- Clinical assessment integration
- Peer-reviewed data collection
- Multiple imaging modalities

---

## 7. HCP Aging Adapter

**File:** `hcp_aging_adapter.py`

### API Details

- **Study URL:** `https://www.humanconnectome.org/study/hcp-lifespan-aging`
- **Data Access:** ConnectomeDB / NIMH Data Archive (NDA)
- **Authentication:** Free registration required
- **Rate Limit:** 60 req/min
- **NDA Collection:** https://nda.nih.gov/edit_collection.html?id=2847

### Data Release

- **Release:** 2.0
- **Subjects:** 725+ (target: 1,500)
- **Age Range:** 36-100+ years
- **Design:** Longitudinal (V1, V2 follow-up)
- **Scanner:** Siemens Prisma 3T

### Modalities Available

| Code | Description | Timepoints |
|------|-------------|------------|
| T1w | T1-weighted structural | V1, V2 |
| T2w | T2-weighted structural | V1, V2 |
| rfMRI | Resting-state fMRI | V1, V2 |
| tfMRI | Task fMRI | V1, V2 |
| dMRI | Diffusion MRI | V1, V2 |

### Behavioral Assessments

- Cognition, Emotion, Motor, Personality, Sensory, Substance Use, Health

### Sample Queries

```python
adapter = HcpAgingAdapter(api_key="your_key")

# Search subjects
results = await adapter.search("HCP12001", {"search_type": "subjects"})

# Search modalities
results = await adapter.search("*", {"search_type": "modalities"})

# Search tasks
results = await adapter.search("WM", {"search_type": "tasks"})

# Search assessments
results = await adapter.search("Cognition", {"search_type": "assessments"})

# Filter by age range
results = await adapter.search("*", {
    "search_type": "subjects",
    "age_min": 65,
    "age_max": 80
})
```

### Canonical Mapping

| HCP-Aging Field | Canonical Field |
|-----------------|-----------------|
| `subject_id` | `subject_id` |
| `modality_code` | `modality` |
| `description` | `name` |
| `age_range` | `value.age_range` |
| `timepoints` | `value.timepoints` |
| `preprocessing_pipeline` | `value.preprocessing` |
| `behavioral_measures` | `value.behavioral_measures` |

### Confidence Scoring

Tier A (NIH-funded, rigorous). Highest overall scores:
- Data quality: 0.95
- Consistency: 0.94
- Longitudinal design
- Lifespan coverage
- Standardized HCP preprocessing

---

## 8. Cross-Adapter Comparison

### Metadata Comparison

| Attribute | NeuroVault | HCP-YA | OpenNeuro | OASIS | HCP-Aging |
|-----------|:----------:|:------:|:---------:|:-----:|:---------:|
| Auth | None | API Key | None | Basic | API Key |
| Protocol | REST | REST | GraphQL | XNAT | REST |
| Avg Confidence | 0.72 | 0.90 | 0.70 | 0.87 | 0.91 |
| Subject Count | 200K+ maps | 1,206 | Varies | 2,600+ | 725+ |
| Longitudinal | No | No | Varies | Yes | Yes |
| Clinical Data | No | No | Varies | Yes | Yes |
| BIDS | No | No | Yes | Partial | No |

### Confidence Tier Distribution

```
Tier A (Meta-analysis/RCT/Rigorous): HCP-YA, OASIS, HCP-Aging
Tier B (Observational/Community):    NeuroVault, OpenNeuro
Tier C (Expert Opinion):              None
```

### Population Coverage

```
Children/Adolescents: Not covered in Batch 1
Young Adults (22-35): HCP-YA
Middle Age (36-60):   HCP-Aging (partial)
Older Adults (60+):   OASIS, HCP-Aging
Full Lifespan:        HCP-Aging (36-100+)
```

---

## 9. Rate Limiting Strategy

### Client-Side Rate Limiting

All adapters implement client-side rate limiting:

```python
# Rate limit configuration per adapter
self.rate_limit_per_minute = 60   # HCP, OASIS, OpenNeuro, HCP-Aging
self.rate_limit_per_minute = 100  # NeuroVault
```

### Recommended Usage Pattern

```python
async with httpx.AsyncClient() as client:
    # Initialize adapters
    adapters = [NeurovaultAdapter(), HcpAdapter(api_key="..."), ...]

    # Validate connections
    for adapter in adapters:
        if await adapter.validate_connection():
            results = await adapter.search(query, filters)
            canonical = [adapter.transform_to_canonical(r) for r in results]

    # Always close
    for adapter in adapters:
        await adapter.close()
```

### Backoff Strategy

| Status Code | Action |
|-------------|--------|
| 429 (Too Many Requests) | Exponential backoff, max 3 retries |
| 500-599 (Server Error) | Linear backoff, max 3 retries |
| 408 (Timeout) | Immediate retry once |
| ConnectionError | Log and mark adapter unavailable |

---

## 10. Error Handling Matrix

### Exception Types

| Exception | NeuroVault | HCP | OpenNeuro | OASIS | HCP-Aging |
|-----------|:----------:|:---:|:---------:|:-----:|:---------:|
| `httpx.HTTPError` | Yes | Yes | Yes | Yes | Yes |
| `httpx.ConnectError` | Yes | Yes | Yes | Yes | Yes |
| `httpx.TimeoutException` | Yes | Yes | Yes | Yes | Yes |
| JSON decode error | Yes | - | Yes | - | - |
| GraphQL error | - | - | Yes | - | - |
| Auth failure | - | Yes | - | Yes | Yes |

### Error Response Pattern

All adapters follow the same error handling pattern:

```python
try:
    response = await self.client.get(url)
    response.raise_for_status()
    data = response.json()
    return data.get("results", [])
except httpx.HTTPError as e:
    logger.error(f"{self.name} HTTP error: {e}")
    return []
except Exception as e:
    logger.error(f"{self.name} unexpected error: {e}")
    return []
```

### Logging

All adapters use the Python `logging` module:

```python
logger = logging.getLogger(__name__)
```

Log levels used:
- **INFO:** Search completion, connection status
- **ERROR:** HTTP failures, parse errors, unexpected exceptions

---

## 11. Canonical Schema Mapping

### CanonicalClinicalRecord Structure

```python
{
    "entity_type": str,           # Type of clinical entity
    "source_database": str,       # Adapter name
    "source_id": str,             # External database ID
    "source_url": str,            # URL to source record
    "name": str,                  # Human-readable name
    "description": str,           # Description
    "subject_id": str,            # Subject/patient ID (if applicable)
    "modality": str,              # Imaging modality
    "value": Dict,                # Database-specific values
    "unit": str,                  # Unit of measurement
    "confidence": Dict,           # 7D confidence scores
    "provenance": Dict,           # Data lineage
    "raw_data": Dict,             # Original raw record
}
```

### Confidence Score Dimensions

```python
{
    "data_quality":        float,  # 0-1, data acquisition quality
    "evidence_strength":   float,  # 0-1, statistical/evidence strength
    "sample_size":         float,  # 0-1, relative sample size
    "replication":         float,  # 0-1, replication status
    "consistency":         float,  # 0-1, cross-study consistency
    "temporal_relevance":  float,  # 0-1, recency of data
    "population_match":    float,  # 0-1, target population match
    "overall":             float,  # 0-1, weighted average
}
```

### Provenance Structure

```python
{
    "source_database": str,       # Database name
    "source_display_name": str,   # Human-readable name
    "source_version": str,        # Database version
    "source_url": str,            # Source URL
    "retrieved_at": str,          # ISO 8601 timestamp
    "confidence_tier": str,       # A | B | C
    "data_quality_score": float,  # 0-1
    "peer_reviewed": bool,        # Peer review status
    "research_only": bool,        # Research use only flag
}
```

---

## 12. Testing Summary

### Test File: `test_batch1_neuroimaging.py`

**Total Test Classes:** 6
**Total Test Methods:** 30+
**Coverage:** All 5 adapters

### Test Categories

| Category | Count | Description |
|----------|-------|-------------|
| Unit tests | 25+ | Individual adapter method testing |
| Mock HTTP | 10+ | Mocked HTTP responses |
| Integration | 5 | Cross-adapter consistency |
| Error cases | 5 | Error handling verification |

### Test Classes

1. `TestNeurovaultAdapter` - 8 tests
2. `TestHcpAdapter` - 8 tests
3. `TestOpenneuroAdapter` - 8 tests
4. `TestOasisAdapter` - 9 tests
5. `TestHcpAgingAdapter` - 8 tests
6. `TestCrossAdapterConsistency` - 4 tests

### Running Tests

```bash
# Install dependencies
pip install pytest pytest-asyncio httpx

# Run all tests
pytest test_batch1_neuroimaging.py -v

# Run specific adapter tests
pytest test_batch1_neuroimaging.py::TestNeurovaultAdapter -v

# Run with coverage
pytest test_batch1_neuroimaging.py --cov=. --cov-report=term-missing
```

### Mock Strategy

All HTTP calls are mocked using `unittest.mock.AsyncMock`:

```python
mock_response = MagicMock()
mock_response.status_code = 200
mock_response.json = MagicMock(return_value={...})
adapter.client.get = AsyncMock(return_value=mock_response)
```

No real API calls are made during testing.

---

## Appendix A: Confidence Tier Definitions

| Tier | Definition | Examples |
|------|------------|----------|
| A | Meta-analysis, RCT, or rigorously curated dataset | HCP-YA, OASIS, HCP-Aging |
| B | Observational study or community-contributed data | NeuroVault, OpenNeuro |
| C | Expert opinion or case report | (none in Batch 1) |

## Appendix B: Authentication Setup

### NeuroVault
No authentication required.

### HCP Young Adult
```python
adapter = HcpAdapter(api_key="your_connectomedb_key")
# Get key at: https://db.humanconnectome.org/
```

### OpenNeuro
No authentication required for read access.

### OASIS
```python
adapter = OasisAdapter(username="your_xnat_username", password="your_xnat_password")
# Register at: https://www.oasis-brains.org/
```

### HCP Aging
```python
adapter = HcpAgingAdapter(api_key="your_connectomedb_key")
# Also requires NDA account: https://nda.nih.gov/
```

## Appendix C: Citation Requirements

### NeuroVault
> Gorgolewski KJ et al. (2015) NeuroVault.org: A repository for sharing
> unthresholded statistical maps, parcellations, and atlases of the human brain.
> NeuroImage, 124, 1242-1247.

### HCP
> Van Essen DC et al. (2013) The WU-Minn Human Connectome Project:
> An overview. NeuroImage, 80, 62-79.

### OpenNeuro
> Markiewicz CJ et al. (2021) The OpenNeuro resource for sharing
> neuroscience data. eLife, 10, e71774.

### OASIS
> Marcus DS et al. (2007) Open Access Series of Imaging Studies (OASIS):
> Cross-sectional MRI data in young, middle aged, nondemented, and demented
> older adults. J Cogn Neurosci, 19(9), 1498-1507.

### HCP-Aging
> Bookheimer SY et al. (2019) The Lifespan Human Connectome Project in Aging:
> An overview. NeuroImage, 185, 335-348.

---

*End of Integration Report*
