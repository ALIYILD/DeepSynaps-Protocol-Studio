# Batch 6 — Adverse Event + AI Literature Adapters Integration Report

## Overview

This report documents the four P0 adapters built for Batch 6, covering AI-powered
academic literature search and three major adverse event / drug safety databases.

| # | Adapter | Database | Records | Type |
|---|---------|----------|---------|------|
| 1 | `SemanticScholarAdapter` | Semantic Scholar (AI2) | 200M+ papers | REST API |
| 2 | `AEOLUSAdapter` | AEOLUS (NLM/NIH) | 4.8M pairs | Download (TSV) |
| 3 | `SIDERAdapter` | SIDER (EMBL-EBI) | 1,400+ drugs, 5,800+ SE | Download (TSV) |
| 4 | `OffsidesTwosidesAdapter` | OFFSIDES/TWOSIDES (Columbia) | 7.5M associations | Download (TSV) |

---

## 1. Semantic Scholar Adapter

### API Details

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.semanticscholar.org/graph/v1` |
| **Auth** | None required (optional API key for higher limits) |
| **Rate Limit (free)** | 100 requests / 5 minutes |
| **Rate Limit (with key)** | 100 requests / 5 minutes |
| **Rate Limit (batch)** | 1 request / second |
| **Adapter enforced** | 1 req/s (free), 0.6s interval (with key) |
| **Confidence Tier** | B (literature, not clinical evidence) |

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/paper/search` | GET/POST | Full-text paper search |
| `/paper/{id}` | GET | Single paper details |
| `/recommendations/papers/` | POST | Paper recommendations |
| `/paper/fields` | GET | Validate connection |

### Key Features

- **AI-generated TLDRs**: Automatically extracted key takeaway for each paper
- **Citation velocity**: `citationCount`, `influentialCitationCount` metrics
- **AE relevance scoring**: Keyword-based relevance score for adverse event research
- **Caching**: In-memory + disk cache for search results
- **Rate limiting**: Per-request interval enforcement with async sleep

### Sample Queries

```python
from semantic_scholar_adapter import SemanticScholarAdapter

adapter = SemanticScholarAdapter()

# Search for adverse event literature
results = await adapter.search(
    "adverse drug reaction pharmacovigilance",
    filters={
        "year_min": 2020,
        "fields_of_study": ["Medicine", "Pharmacology"],
        "limit": 20,
        "sort": "citationCount",
    }
)

# Get paper details
paper = await adapter.get_paper("paper-id-123", include_citations=True)

# Get recommendations
recs = await adapter.get_recommendations(["paper-id-1", "paper-id-2"], limit=10)

# Transform to canonical
canonical = adapter.transform_to_canonical(results[0])
```

### Canonical Output Schema

```json
{
  "entity_type": "evidence",
  "source_database": "semantic_scholar",
  "source_id": "paper-id",
  "title": "Paper Title",
  "abstract": "Abstract text...",
  "tldr": "AI-generated summary...",
  "authors": ["Author A", "Author B"],
  "year": 2023,
  "venue": "Journal Name",
  "citation_count": 150,
  "influential_citation_count": 25,
  "fields_of_study": ["Medicine", "Pharmacology"],
  "is_open_access": true,
  "adverse_event_relevance_score": 0.65,
  "confidence": { ... },
  "provenance": { ... },
  "raw_data": { ... }
}
```

---

## 2. AEOLUS Adapter

### Dataset Details

| Property | Value |
|----------|-------|
| **Source** | NLM/NIH — standardized FAERS |
| **Landing Page** | `https://datadryad.org/stash/dataset/doi:10.5061/dryad.8q0s4` |
| **Records** | ~4.8M drug-adverse event pairs |
| **Format** | TSV (tab-separated values) |
| **Coding** | MedDRA preferred terms, RxNorm concepts, SNOMED CT |
| **Confidence Tier** | B (spontaneous reporting) |
| **Research Only** | **ALWAYS TRUE** |

### Data Schema

| Column | Description |
|--------|-------------|
| `drug_concept_id` | RxNorm/RxCUI concept identifier |
| `drug_concept_name` | Drug name (RxNorm preferred) |
| `condition_concept_id` | Condition concept ID |
| `condition_concept_name` | Condition/AD event name |
| `snomed_concept_id` | SNOMED CT concept ID |
| `meddra_concept_code` | MedDRA preferred term code |
| `meddra_concept_name` | MedDRA preferred term name |
| `count` | Number of FAERS reports |

### Key Features

- **Inverted indices**: Fast search by drug name, condition, RxNorm ID, MedDRA code
- **Count filtering**: Filter by minimum report count
- **Drug/condition convenience methods**: `search_by_drug()`, `search_by_condition()`
- **Summary statistics**: `get_drug_event_summary()` for top events per drug
- **File caching**: Auto-download + local cache of TSV files

### Sample Queries

```python
from aeolus_adapter import AEOLUSAdapter

adapter = AEOLUSAdapter(data_dir="./data/aeolus", auto_download=True)

# Search by drug
results = await adapter.search("Aspirin", filters={"search_field": "drug", "min_count": 100})

# Search by adverse event
results = await adapter.search("Gastrointestinal hemorrhage", filters={"search_field": "condition"})

# Convenience methods
results = await adapter.search_by_drug("Aspirin", limit=50)
results = await adapter.search_by_condition("Acute kidney injury", limit=50)

# Drug summary
summary = await adapter.get_drug_event_summary("Aspirin")
# => { "drug": "Aspirin", "total_events": 45, "total_reports": 15000, "top_events": [...] }

# Transform
canonical = adapter.transform_to_canonical(results[0])
```

### Canonical Output Schema

```json
{
  "entity_type": "adverse_event",
  "source_database": "aeolus",
  "source_id": "aeolus:191337:31967",
  "drug_name": "Aspirin",
  "drug_id_rxcui": "191337",
  "event_name": "Gastrointestinal hemorrhage",
  "event_id": "31967",
  "meddra_code": "10017955",
  "meddra_name": "Gastrointestinal haemorrhage",
  "report_count": 2453,
  "frequency": 2453,
  "severity": "unknown",
  "confidence": { ... },
  "provenance": {
    "source_database": "aeolus",
    "research_only": true,
    "caveats": ["Spontaneous reporting, not RCT evidence", ...]
  },
  "raw_data": { ... }
}
```

### Caveats

- Spontaneous reporting — cannot establish causality
- Reporting bias and under-reporting are common
- Counts are report counts, not incidence rates
- Temporal relationships may be confounded

---

## 3. SIDER Adapter

### Dataset Details

| Property | Value |
|----------|-------|
| **Source** | EMBL-EBI, Kuhn et al. |
| **Landing Page** | `http://sideeffects.embl.de/` |
| **Drugs** | 1,400+ (STITCH ID mapped) |
| **Side Effects** | 5,800+ (MedDRA coded) |
| **Format** | TSV (some gzipped) |
| **Files** | `drug_names.tsv`, `meddra_all_se.tsv.gz`, `meddra_freq.tsv.gz` |
| **Confidence Tier** | B (label-derived + FAERS) |
| **Research Only** | **ALWAYS TRUE** |

### Data Files

| File | Content | Rows (typical) |
|------|---------|----------------|
| `drug_names.tsv` | STITCH ID to drug name mapping | ~1,400 |
| `meddra_all_se.tsv.gz` | All drug-side effect associations | ~140,000 |
| `meddra_freq.tsv.gz` | Side effect frequencies (where available) | ~100,000 |

### Key Features

- **Frequency enrichment**: Side effect records augmented with frequency data when available
- **Severity inference**: Derived from frequency bounds (rare/uncommon/common)
- **Placebo flag**: Distinguishes placebo-associated effects
- **Drug/SE listing**: `list_all_drugs()`, `list_all_side_effects()`
- **Bidirectional search**: Drug -> effects OR effect -> drugs

### Sample Queries

```python
from sider_adapter import SIDERAdapter

adapter = SIDERAdapter(data_dir="./data/sider", auto_download=True)

# Search by drug
results = await adapter.search("Aspirin", filters={"search_field": "drug", "include_frequency": True})

# Search by side effect
results = await adapter.search("Gastric ulcer", filters={"search_field": "side_effect"})

# Convenience methods
se = await adapter.get_side_effects_for_drug("Aspirin", limit=50)
drugs = await adapter.get_drugs_for_side_effect("Nausea", limit=50)

# List all
drugs = await adapter.list_all_drugs()
effects = await adapter.list_all_side_effects()

# Transform
canonical = adapter.transform_to_canonical(results[0])
```

### Canonical Output Schema

```json
{
  "entity_type": "adverse_event",
  "source_database": "sider",
  "source_id": "sider:CID000002173:C0017185",
  "drug_name": "Aspirin",
  "drug_id_stitch": "CID000002173",
  "event_name": "Gastric ulcer",
  "event_id_umls": "C0017185",
  "meddra_type": "PT",
  "frequency": 0.03,
  "frequency_description": "",
  "frequency_bounds": { "lower": "0.01", "upper": "0.05" },
  "placebo_associated": false,
  "severity": "uncommon",
  "confidence": { ... },
  "provenance": { ... },
  "raw_data": { ... }
}
```

### Caveats

- Derived from drug labels and spontaneous reports
- Frequencies may vary between label sources
- Not all side effects have frequency data
- Cannot establish causality for label-derived effects

---

## 4. OFFSIDES / TWOSIDES Adapter

### Dataset Details

| Property | Value |
|----------|-------|
| **Source** | Tatonetti Lab, Columbia University |
| **Repository** | `https://github.com/tatonetti-lab/onsides` |
| **OFFSIDES** | 2.9M off-label side effect associations |
| **TWOSIDES** | 4.6M drug-drug interaction adverse effects |
| **Format** | TSV (gzipped) |
| **Statistical Scores** | PRR, IC (Information Component), p-value, Bonferroni |
| **Confidence Tier** | B (data mining of spontaneous reports) |
| **Research Only** | **ALWAYS TRUE** |

### Data Schema — OFFSIDES

| Column | Description |
|--------|-------------|
| `drug_rxnorn_id` | RxNorm concept ID for the drug |
| `drug_name` | Drug name |
| `condition_meddra_id` | MedDRA concept ID for the event |
| `condition_name` | MedDRA preferred term |
| `PRR` | Proportional Reporting Ratio |
| `IC` | Information Component (signal strength) |
| `IC_lower` / `IC_upper` | 95% CI for IC |
| `case_count` | Number of co-occurrence reports |
| `p_value` | Statistical significance |
| `bonferroni_significant` | Corrected significance |

### Data Schema — TWOSIDES (additional)

| Column | Description |
|--------|-------------|
| `drug1_rxnorm_id` / `drug1_name` | First drug in pair |
| `drug2_rxnorm_id` / `drug2_name` | Second drug in pair |

### Key Features

- **Dual dataset**: Unified OFFSIDES + TWOSIDES search
- **Statistical filtering**: Filter by IC threshold, Bonferroni significance
- **Signal strength**: Severity derived from IC (weak/moderate/high signal)
- **Top signals**: `get_top_signals()` returns highest-IC associations
- **Drug summary**: `get_drug_signal_summary()` aggregates both datasets

### Sample Queries

```python
from offsides_twosides_adapter import OffsidesTwosidesAdapter

adapter = OffsidesTwosidesAdapter(data_dir="./data/offsides", auto_download=True)

# Search both datasets
results = await adapter.search("Aspirin", filters={"dataset": "both"})

# OFFSIDES only (off-label effects)
results = await adapter.search_offsides("Aspirin", min_ic=1.5)

# TWOSIDES only (drug-drug interactions)
results = await adapter.search_twosides("Aspirin")
results = await adapter.search_twosides("Aspirin", drug2="Ibuprofen")

# Strong signals only
results = await adapter.search("Aspirin", filters={
    "min_ic": 2.0,
    "bonferroni_only": True,
    "dataset": "offsides",
})

# Top signals
top = await adapter.get_top_signals(dataset="offsides", min_ic=2.0, limit=20)

# Drug summary
summary = await adapter.get_drug_signal_summary("Aspirin")
# => { "drug": "Aspirin", "offsides": {...}, "twosides": {...} }

# Transform
canonical = adapter.transform_to_canonical(results[0])
```

### Canonical Output Schema

```json
{
  "entity_type": "adverse_event",
  "source_database": "offsides_twosides",
  "source_id": "offsides:191337:10017955",
  "dataset": "OFFSIDES",
  "drug_name": "Aspirin",
  "drug1_name": "Aspirin",
  "drug1_id_rxnorm": "191337",
  "drug2_name": "",
  "drug2_id_rxnorm": "",
  "is_drug_interaction": false,
  "event_name": "Gastrointestinal haemorrhage",
  "event_id_meddra": "10017955",
  "report_count": 2453,
  "statistical_scores": {
    "PRR": 4.52,
    "IC": 2.18,
    "IC_lower": 1.95,
    "IC_upper": 2.41,
    "p_value": 0.000001,
    "bonferroni_significant": true
  },
  "severity": "moderate_signal",
  "confidence": { ... },
  "provenance": { ... },
  "raw_data": { ... }
}
```

### Interpreting Statistical Scores

| Metric | Interpretation |
|--------|----------------|
| **IC > 0** | Positive signal (drug more likely than expected) |
| **IC > 1.5** | Moderate signal |
| **IC > 3.0** | Strong signal |
| **PRR > 2** | Drug reported 2x more than expected |
| **Bonferroni sig = true** | Survives multiple testing correction |

### Caveats

- Data mining of spontaneous reports — associations, not causation
- May be confounded by indication or polypharmacy
- Off-label signals require clinical validation
- Drug-drug interactions may be confounded by patient comorbidities

---

## Cross-Adapter Comparison

| Feature | Semantic Scholar | AEOLUS | SIDER | OFFSIDES/TWOSIDES |
|---------|-----------------|--------|-------|-------------------|
| **Type** | REST API | Download | Download | Download |
| **Auth** | Optional key | None | None | None |
| **Data Source** | Academic papers | FAERS (standardized) | Drug labels + FAERS | FAERS (data mining) |
| **Coding** | — | MedDRA, RxNorm | MedDRA, UMLS, STITCH | MedDRA, RxNorm |
| **Confidence** | B (literature) | B (spontaneous) | B (label-derived) | B (data mining) |
| **Research Only** | Yes | **ALWAYS** | **ALWAYS** | **ALWAYS** |
| **Causality** | N/A | No | No | No |
| **Statistical Scores** | Citations | Report counts | Frequencies | PRR, IC, p-value |
| **Rate Limit** | 100/5min | N/A (local) | N/A (local) | N/A (local) |

---

## Installation & Setup

```bash
# Install dependencies
pip install httpx pytest

# Optional: set cache directories
export SEMANTIC_SCHOLAR_API_KEY="your-key-here"  # optional
export AEOLUS_DATA_DIR="./data/aeolus"
export SIDER_DATA_DIR="./data/sider"
export OFFSIDES_DATA_DIR="./data/offsides_twosides"

# Run tests
pytest test_batch6_adverse_events.py -v
```

## File Inventory

| File | Lines | Description |
|------|-------|-------------|
| `semantic_scholar_adapter.py` | ~450 | AI literature search adapter |
| `aeolus_adapter.py` | ~380 | Standardized FAERS adapter |
| `sider_adapter.py` | ~400 | Drug side effect adapter |
| `offsides_twosides_adapter.py` | ~500 | Data mining adverse events adapter |
| `test_batch6_adverse_events.py` | ~650 | Comprehensive test suite |
| `BATCH6_ADVERSE_EVENTS_INTEGRATION_REPORT.md` | — | This report |

---

## Safety Notes

> **ALL adverse event adapters (AEOLUS, SIDER, OFFSIDES/TWOSIDES) set
> `research_only = True` in both the adapter configuration AND the provenance
> metadata. This is a critical safety requirement.**
>
> These databases contain:
> - Spontaneous adverse event reports (not clinical trial outcomes)
> - Statistical associations (not established causality)
> - Data-mined signals (requiring clinical validation)
>
> **Never use these data for direct clinical decision-making without
> expert review and corroboration from controlled clinical evidence.**
