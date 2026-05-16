# Open Source Stack Report: PHASE 2 Integration
## DeepSynaps Protocol Studio - Knowledge Layer

**Report Date:** 2025-07-14
**Scope:** FAERS/Adverse Events, OnSIDES, Allen Brain Atlas, Schaefer/Network Atlases,
Neurosynth/NeuroQuery, ADNI/ABIDE Cohorts, Network Neuroscience
**Classification:** Production-Ready Open Source Intelligence

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [FAERS / Adverse Event Stack](#2-faers--adverse-event-stack)
3. [OnSIDES Stack](#3-onsides-stack)
4. [Allen Brain Atlas Stack](#4-allen-brain-atlas-stack)
5. [Schaefer / Network Atlas Stack](#5-schaefer--network-atlas-stack)
6. [Neurosynth / NeuroQuery Stack](#6-neurosynth--neuroquery-stack)
7. [ADNI / ABIDE Cohort Stack](#7-adni--abide-cohort-stack)
8. [Network Neuroscience Stack](#8-network-neuroscience-stack)
9. [Recommended Integration Stack](#9-recommended-integration-stack)
10. [Licensing Compliance Matrix](#10-licensing-compliance-matrix)
11. [Implementation Priority](#11-implementation-priority)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

This report identifies 35+ open-source libraries, tools, and datasets across 7 categories
required for DeepSynaps Protocol Studio PHASE 2 Knowledge Layer integration. Each tool has
been evaluated for license compatibility, maintenance status, community adoption,
Python version support, documentation quality, and integration complexity.

### Key Findings at a Glance

| Category | Tools Found | Top Recommendation | License |
|----------|-------------|-------------------|---------|
| FAERS/AE Parsing | 8 | `vigipy` + custom openFDA client | GPLv3 / MIT |
| OnSIDES | 3 | `onsides` (data releases) | MIT |
| Allen Brain Atlas | 4 | `allensdk` | BSD-3-Clause |
| Schaefer Atlas | 3 | `nilearn` built-in | BSD-3-Clause |
| Neurosynth/NeuroQuery | 5 | `nimare` + `neuroquery` | MIT / BSD-3-Clause |
| ADNI/ABIDE | 4 | `nilearn` fetchers + custom | BSD-3-Clause |
| Network Neuroscience | 6 | `bctpy` + `nilearn` + `netneurotools` | BSD-3-Clause |

### Overall Recommendation Counts

| Verdict | Count |
|---------|-------|
| **USE** (production-ready) | 12 |
| **EVALUATE** (good, needs testing) | 14 |
| **SKIP** (stale/abandoned/GPL risk) | 9 |

### Integration Complexity Summary

- **LOW:** Tools with pip install, clean APIs, good docs (`nilearn`, `neuroquery`, `nimare`, `netneurotools`)
- **MEDIUM:** Tools requiring configuration, data downloads, or API keys (`allensdk`, `vigipy`, OnSIDES)
- **HIGH:** Tools requiring manual pipeline setup, substantial preprocessing, or legal agreements (ADNI LONI IDA, FAERS quarterly data)

---

## 2. FAERS / Adverse Event Stack

### 2.1 Overview

The FDA Adverse Event Reporting System (FAERS) is the world's largest pharmacovigilance
database. PHASE 2 requires: (a) parsing quarterly ASCII releases, (b) openFDA API
access, (c) signal detection algorithms (PRR, ROR, EBGM, IC), and (d) data
cleaning/deduplication.

### 2.2 Recommended Tools

#### 2.2.1 vigipy -- Pharmacovigilance Signal Detection

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/Shakesbeery/vigipy |
| **License** | GNU GPLv3 |
| **Language** | Python 3 |
| **Stars** | ~20 |
| **Last Commit** | 2024 (active) |
| **Python Support** | 3.8+ |
| **Installation** | `git clone + pip install` (no PyPI) |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Best Python-native pharmacovigilance library. Implements PRR, ROR, BCPNN, GPS, LASSO, LongitudinalModel. GPLv3 is copyleft -- must evaluate license compatibility. Clean API, good unit test coverage. |

**Signal Detection Algorithms:**
- `bcpnn()` - Bayesian Confidence Propagation Neural Network
- `gps()` - Multi-item Gamma Poisson Shrinker
- `lasso()` - LASSO for signal detection
- `prr()` - Proportional Reporting Ratio
- `ror()` - Reporting Odds Ratio
- `rfet()` - Reporting Fisher's Exact Test
- `LongitudinalModel()` - Time-based signal evolution

```python
# Usage Example
import vigipy
# Build contingency table from FAERS data
contingency = vigipy.convert(data, product_col="drug", event_col="ae")
# Run PRR analysis
prr_results = vigipy.prr(contingency)
# Run ROR analysis
ror_results = vigipy.ror(contingency)
# Run BCPNN
bcpnn_results = vigipy.bcpnn(contingency)
```

**Integration Notes:**
- GPLv3 license requires PHASE 2 to be open-sourced if vigipy is linked/integrated
- Consider wrapping vigipy as a microservice to avoid license contamination
- Dependencies: pandas==2.2.2, numpy<2, scipy, scikit-learn, sympy, statsmodels

---

#### 2.2.2 openFDA Drug Event API (Official)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/FDA/openfda |
| **License** | Public Domain (US Gov work) |
| **Language** | Python 3.10 + Node.js + Elasticsearch |
| **Stars** | ~1,200 |
| **Last Commit** | 2024 (active) |
| **Python Support** | 3.10+ |
| **Installation** | No pip package; use `requests` directly |
| **Recommendation** | **USE** |
| **Rationale** | Official FDA API. No restrictions on use. Rate limits: 240 req/min (no key), 120,000 req/day (with key). Clean REST JSON API. |

```python
# Usage Example
import requests

API_KEY = "your_key"  # Optional but recommended
base_url = "https://api.fda.gov/drug/event.json"

params = {
    "api_key": API_KEY,
    "search": 'patient.drug.medicinalproduct:"aspirin"',
    "limit": 100
}
response = requests.get(base_url, params=params)
data = response.json()
results = data.get("results", [])
```

**Integration Notes:**
- No pip package needed -- simple HTTP API
- Consider implementing caching layer for repeated queries
- No license restrictions (US Government work)

---

#### 2.2.3 FAERS-Toolkit (Parsing & MySQL/SQLite)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/kylechua/faers-toolkit |
| **License** | Not specified (assumed open) |
| **Language** | Python 3 |
| **Stars** | ~15 |
| **Last Commit** | 2019 (stale) |
| **Recommendation** | **SKIP** |
| **Rationale** | Last commit 2019. Signal scores "under construction." Better alternatives exist. |

---

#### 2.2.4 FAERS Data Parser (djm-35)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/djm-35/faers-data |
| **License** | MIT License |
| **Language** | Python 3 |
| **Stars** | ~10 |
| **Last Commit** | 2015 (very stale) |
| **Recommendation** | **SKIP** |
| **Rationale** | Very stale (2015). Only covers 2004-2014 data. Not suitable for production. |

---

#### 2.2.5 FAERS_PHARMACOVIGILANCE_ANALYSIS (Notebook-based)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/DSimoens/FAERS_PHARMACOVIGILANCE_ANALYSIS |
| **License** | Not specified |
| **Language** | Python 3 (Jupyter Notebook) |
| **Stars** | ~5 |
| **Last Commit** | 2025 (recent) |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Recent activity. Good reference implementation. Calculates ROR, PRR, RRR, Haldane OR, Fisher exact test, Chi-square, BCPNN IC, EBGM. VigiMatch deduplication. Export to Excel. Good as a reference implementation, not as a library. |

---

#### 2.2.6 openfda-faers (Jupyter Notebook)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neksa/openfda-faers |
| **License** | Not specified |
| **Language** | Python 3.6+ |
| **Stars** | ~15 |
| **Last Commit** | 2020 |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Good exploratory notebook for openFDA API usage. Binder/Google Colab compatible. Good reference for API interaction patterns. Not a library. |

---

#### 2.2.7 Bioconductor faers (R Package)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/WangLabCSU/faers |
| **License** | Artistic-2.0 (Bioconductor) |
| **Language** | R |
| **Stars** | N/A |
| **Last Commit** | 2025 (active) |
| **Recommendation** | **EVALUATE** (for reference) |
| **Rationale** | Well-maintained R package for FAERS download, parse, combine. Unified pharmacovigilance analysis. Good reference for Python porting. Not directly usable from Python without rpy2. |

---

#### 2.2.8 MDDC (R/Python Package)

| Attribute | Detail |
|-----------|--------|
| **Reference** | https://arxiv.org/html/2410.01168v1 |
| **License** | Not specified |
| **Language** | R and Python |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Newer approach using Multinomial Drug-Event Combination Detection. Published 2024. May offer advantages over traditional PRR/ROR. Check if open-source implementation available. |

---

#### 2.2.9 FAERS-Database (PostgreSQL-based)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/MarwaEshra/FAERS-Database |
| **License** | Not specified |
| **Language** | Python + PostgreSQL |
| **Stars** | ~15 |
| **Last Commit** | 2020 |
| **Recommendation** | **SKIP** |
| **Rationale** | PostgreSQL-based approach. Covers 2012-2020 only. Not actively maintained. |

---

### 2.3 FAERS Stack Summary

| Tool | Verdict | Complexity | License Risk |
|------|---------|------------|--------------|
| `vigipy` | EVALUATE | Medium | HIGH (GPLv3) |
| `openFDA API` | USE | Low | None |
| `FAERS-Toolkit` | SKIP | Medium | Unknown |
| `djm-35/faers-data` | SKIP | Low | MIT (but stale) |
| `FAERS_PHARMACOVIGILANCE_ANALYSIS` | EVALUATE | Medium | Unknown |
| `openfda-faers` | EVALUATE | Low | Unknown |
| `Bioconductor faers` | EVALUATE | Medium | Low (Artistic-2.0) |

### 2.4 Recommended FAERS Integration Architecture

```
FAERS Quarterly Data (ASCII ZIP)
    |
    v
[Custom Python Parser]  -->  pandas DataFrame  -->  [Deduplication Engine]
    |                                                        |
openFDA API                                                SQLite/PostgreSQL
    |                                                        |
    v                                                        v
[openFDA Client]          -->  [Signal Detection Layer]
                                    |
                            [vigipy microservice]
                                    |
                            PRR / ROR / BCPNN / IC
                                    |
                            [DeepSynaps Knowledge Layer]
```

---

## 3. OnSIDES Stack

### 3.1 Overview

OnSIDES (Open Sourcelabel Information for Drug Effect Surveillance) is the leading
open-source resource for adverse drug effects extracted from FDA structured product
labels using NLP (PubMedBERT). Contains 7.1M+ drug-ADE pairs for 4,097 drug ingredients.

### 3.2 Recommended Tools

#### 3.2.1 OnSIDES Official Repository & Data Releases

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/tatonetti-lab/onsides |
| **License** | MIT License |
| **Data Source** | DailyMed (US), EMA (EU), EMC (UK), KEGG (Japan) |
| **Stars** | ~50 |
| **Last Commit** | 2025 (active) |
| **Data Releases** | Quarterly (latest: v3.1.0) |
| **Recommendation** | **USE** |
| **Rationale** | Gold standard for drug label-derived ADE extraction. PubMedBERT-based NLP. SQLite database available. Quarterly updates. Clean data releases as tar.gz files. |

**Data Access:**
```python
import sqlite3
import pandas as pd

# OnSIDES provides pre-built SQLite database
conn = sqlite3.connect("onsides_database.db")

# Query drug-ADE pairs
query = """
SELECT drug_name, adverse_event, pt_meddra_id, source_label
FROM drug_adverse_events
WHERE drug_name = 'metformin'
"""
df = pd.read_sql(query, conn)
```

**Database Schema (provided):**
- MySQL, PostgreSQL, and SQLite schema files included
- Example bash scripts for database loading
- Pre-built SQLite database (~300 MB)

---

#### 3.2.2 OnSIDES Web API

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/tatonetti-lab/onsides-web |
| **License** | MIT License |
| **Stack** | Flask backend + React frontend |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Flask API that wraps OnSIDES database. Can be self-hosted. Nginx + Gunicorn deployment. Good for building a microservice layer. |

```python
# Example API usage
import requests

response = requests.get(
    "https://onsidesdb.org/api/drug",
    params={"name": "metformin"}
)
data = response.json()
```

---

#### 3.2.3 OnSIDES NLP Pipeline (Full Rebuild)

| Attribute | Detail |
|-----------|--------|
| **Requirements** | Python, Java, tabula, pandoc, DuckDB, Snakemake |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Full pipeline for rebuilding OnSIDES from source labels. Complex (multi-day build). Nix-based dependency management. Use only if custom label extraction is needed. |

---

### 3.3 OnSIDES Stack Summary

| Tool | Verdict | Complexity | Notes |
|------|---------|------------|-------|
| OnSIDES Data Releases | USE | Low | Download SQLite, query directly |
| OnSIDES Web API | EVALUATE | Medium | Self-host Flask API |
| OnSIDES NLP Pipeline | EVALUATE | Very High | Only for custom rebuilds |

---

## 4. Allen Brain Atlas Stack

### 4.1 Overview

The Allen Brain Atlas provides comprehensive gene expression, connectivity, and
electrophysiology data for mouse and human brains. PHASE 2 requires gene expression
analysis tools, structure lookup, and API access to the Allen Brain Map datasets.

### 4.2 Recommended Tools

#### 4.2.1 AllenSDK (Official Python SDK)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/AllenInstitute/AllenSDK |
| **License** | BSD-3-Clause (with commercial restriction clause) |
| **Stars** | ~400+ |
| **Last Commit** | 2025 (maintenance mode) |
| **Python Support** | 3.9, 3.10, 3.11 |
| **Installation** | `pip install allensdk` or `conda install -c conda-forge allensdk` |
| **Documentation** | https://allensdk.readthedocs.io/ |
| **Recommendation** | **USE** |
| **Rationale** | Official SDK from Allen Institute. Gene expression data, Cell Types Database, Mouse Connectivity Atlas, Brain Observatory. Note: BSD-3-Clause with additional commercial restriction clause -- not OSI-approved pure BSD. Evaluate for commercial use. |

```python
# Usage Example - Gene Expression Query
from allensdk.api.queries.mouse_gene_expression_api import MouseGeneExpressionApi
from allensdk.api.queries.structure_api import StructureApi

# Get gene expression data
mge_api = MouseGeneExpressionApi()
structure_api = StructureApi()

# Get all structures
structures = structure_api.get_structures()

# Query gene expression for specific gene
gene_data = mge_api.get_gene_expression(
    gene_ids=[12345],
    structure_ids=[123, 456]
)
```

**Key Modules:**
- `allensdk.core.mouse_connectivity_cache` - Mouse connectivity data
- `allensdk.brain_observatory` - Visual behavior / ecephys data
- `allensdk.api.queries` - Gene expression, structure queries
- `allensdk.brain_observatory.ecephys` - Neuropixels extracellular electrophysiology

---

#### 4.2.2 Allen Brain Atlas Gene Expression Pipeline (Fulcher/Fornito)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/benfulcher/AllenSDK |
| **License** | Not specified |
| **Language** | Python + MATLAB |
| **Stars** | ~50 |
| **Last Commit** | 2017 |
| **Recommendation** | **SKIP** |
| **Rationale** | Older wrapper for specific gene expression x brain region matrix construction. MATLAB dependency. Not actively maintained. Use official AllenSDK instead. |

---

#### 4.2.3 Brain Modeling Toolkit (BMTK)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/AllenInstitute/bmtk |
| **License** | BSD-3-Clause |
| **Stars** | ~200 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.8+ |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Large-scale neural network model building and simulation. Supports biophysically detailed, point neuron, filter, and population-level models. Good for advanced brain modeling, not required for basic atlas loading. |

---

### 4.3 Allen Brain Atlas Stack Summary

| Tool | Verdict | Complexity | Notes |
|------|---------|------------|-------|
| `allensdk` | USE | Medium | Official SDK, maintenance mode, commercial clause |
| `benfulcher/AllenSDK` | SKIP | High | Stale, MATLAB dependency |
| `bmtk` | EVALUATE | High | Advanced modeling, not required for atlas loading |

---

## 5. Schaefer / Network Atlas Stack

### 5.1 Overview

The Schaefer 2018 parcellation is a widely-used cortical parcellation based on
resting-state fMRI, available in multiple resolutions (100-1000 ROIs) with Yeo
network assignments (7 or 17 networks). PHASE 2 also requires access to the
Glasser 2016 (HCP) atlas and network visualization tools.

### 5.2 Recommended Tools

#### 5.2.1 nilearn (Built-in Schaefer Loader)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/nilearn/nilearn |
| **License** | BSD-3-Clause |
| **Stars** | ~1,800+ |
| **Last Commit** | 2025 (very active) |
| **Python Support** | 3.9+ |
| **Installation** | `pip install nilearn` |
| **Documentation** | https://nilearn.github.io/ |
| **Recommendation** | **USE** |
| **Rationale** | The standard neuroimaging library in Python. Built-in Schaefer 2018 loader with multiple resolutions. Also includes AAL, Harvard-Oxford, and many other atlases. Well-maintained, excellent docs, large community. |

```python
# Usage Example - Schaefer Atlas Loading
from nilearn.datasets import fetch_atlas_schaefer_2018
from nilearn.plotting import plot_roi

# Fetch Schaefer 400-parcel, 7-network atlas
atlas = fetch_atlas_schaefer_2018(
    n_rois=400,
    yeo_networks=7,
    resolution_mm=1
)

print(f"Atlas maps: {atlas.maps}")
print(f"Labels: {len(atlas.labels)} regions")

# Visualize
plot_roi(atlas.maps, title="Schaefer 2018 (400 ROIs, 7 Networks)")
```

**Available Configurations:**
| n_rois | yeo_networks | resolution_mm |
|--------|-------------|---------------|
| 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 | 7 or 17 | 1 or 2 |

---

#### 5.2.2 nilearn Connectivity Tools (Functional Connectomes)

| Attribute | Detail |
|-----------|--------|
| **Part of** | `nilearn` |
| **Recommendation** | **USE** |

```python
# Usage Example - Extracting Connectivity Matrices
from nilearn.connectome import ConnectivityMeasure
from nilearn.datasets import fetch_atlas_schaefer_2018
from nilearn.maskers import NiftiLabelsMasker
import numpy as np

# Load atlas
atlas = fetch_atlas_schaefer_2018(n_rois=200, yeo_networks=7)

# Extract time series (from preprocessed fMRI)
masker = NiftiLabelsMasker(
    labels_img=atlas.maps,
    standardize=True,
    memory='nilearn_cache',
    verbose=1
)
time_series = masker.fit_transform(func_img, confounds=confounds)

# Compute correlation matrix
correlation_measure = ConnectivityMeasure(kind='correlation')
correlation_matrix = correlation_measure.fit_transform([time_series])[0]
```

---

#### 5.2.3 neurocaps (Parcellation Wrapper)

| Attribute | Detail |
|-----------|--------|
| **Documentation** | https://neurocaps.readthedocs.io/ |
| **License** | Not specified |
| **Python Support** | 3.8+ |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Higher-level wrapper around nilearn for parcellation-based analyses. Supports Schaefer, AAL, and custom parcellations. Good for CAP (Co-activation Patterns) analyses. |

---

#### 5.2.4 Glasser 2016 (HCP-MMP1.0) Atlas

| Attribute | Detail |
|-----------|--------|
| **Source** | HCP (Human Connectome Project) |
| **nilearn Support** | Via `fetch_atlas` (community extensions) |
| **Direct Download** | https://balsa.wustl.edu/WN56 |
| **Recommendation** | **USE** |
| **Rationale** | 360-region multimodal parcellation. Available in MNI space. Can be loaded via `nibabel` and used with `NiftiLabelsMasker`. No built-in nilearn fetcher, but community implementations exist. |

```python
# Loading Glasser 2016 manually
import nibabel as nib
from nilearn.maskers import NiftiLabelsMasker

glasser_img = nib.load('HCP_MMP1.0_MNI152.nii.gz')
masker = NiftiLabelsMasker(labels_img=glasser_img, standardize=True)
time_series = masker.fit_transform(func_img)
```

---

### 5.3 Schaefer/Network Atlas Stack Summary

| Tool | Verdict | Complexity | Notes |
|------|---------|------------|-------|
| `nilearn` (built-in Schaefer) | USE | Low | Built-in, excellent, production-ready |
| `nilearn` connectivity | USE | Low | Correlation, partial correlation, tangent |
| `neurocaps` | EVALUATE | Medium | Higher-level wrapper |
| Glasser 2016 | USE | Low | Manual loading via nibabel |

---

## 6. Neurosynth / NeuroQuery Stack

### 6.1 Overview

Neurosynth and NeuroQuery are the two leading platforms for large-scale neuroimaging
meta-analysis. Neurosynth uses a database of ~14,000 studies with stereotactic
coordinates. NeuroQuery is a predictive meta-analysis tool that generates brain maps
from text queries. PHASE 2 requires: (a) coordinate-based meta-analysis, (b) predictive
encoding/decoding, (c) term-to-brain mapping.

### 6.2 Recommended Tools

#### 6.2.1 NiMARE (Neuroimaging Meta-Analysis Research Environment)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neurostuff/NiMARE |
| **License** | MIT License |
| **Stars** | ~209 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.9+ |
| **Installation** | `pip install nimare` |
| **Documentation** | https://nimare.readthedocs.io/ |
| **Recommendation** | **USE** |
| **Rationale** | THE Python meta-analysis package. Coordinate-based (ALE, MKDA, KDA) and image-based (IBMA) meta-analysis. Functional decoding. Automated annotation. Fetches Neurosynth and NeuroQuery datasets. MIT license. Active development. Aperture Neuro publication. |

**Implemented Algorithms:**
- **CBMA:** ALE, SCALE, MKDA (density & chi-square), KDA
- **IBMA:** MFX GLM, RFX GLM, FFX GLM, Contrast Permutation, Fisher's, Stouffer's, Weighted Stouffer's, Z MFX, Z Permutation
- **Bayesian:** Mixed-effects with Stan
- **Decoding:** Functional decoding from meta-analytic maps
- **Annotation:** Automated annotation with Cognitive Atlas

```python
# Usage Example - Download Neurosynth + ALE Meta-Analysis
from nimare.extract import fetch_neurosynth
from nimare.io import convert_neurosynth_to_dataset
from nimare.meta.cbma import ALE
from nimare.correct import FWERCorrector

# Download Neurosynth dataset
files = fetch_neurosynth(
    data_dir=".",
    version="7",
    source="abstract",
    vocab="terms",
    return_type="files"
)

# Convert to NiMARE dataset
dataset = convert_neurosynth_to_dataset(
    files[0],  # coordinates file
    files[1]   # metadata file
)

# Run ALE meta-analysis on pain studies
pain_ids = dataset.search_features("pain")
pain_dataset = dataset.slice(pain_ids)

ale = ALE()
ale.fit(pain_dataset)

# Multiple comparisons correction
corrector = FWERCorrector(method="montecarlo", n_iters=1000)
corrected_results = corrector.transform(ale.results)
```

---

#### 6.2.2 NeuroQuery (Predictive Meta-Analysis)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neuroquery/neuroquery |
| **License** | BSD-3-Clause |
| **Stars** | ~36 |
| **Last Commit** | 2025 (archived Aug 2025) |
| **Python Support** | 3.7+ |
| **Installation** | `pip install neuroquery` |
| **Documentation** | https://neuroquery.org |
| **Recommendation** | **USE** |
| **Rationale** | Reduced-rank linear regression model for text-to-brain mapping. Trained on ~14,000 publications, 400,000+ peak activations. Generates brain maps from text queries. BSD-3-Clause license. Note: archived in Aug 2025 but still functional. |

```python
# Usage Example - Text-to-Brain Mapping
from neuroquery import fetch_neuroquery_model, NeuroQueryModel
from nilearn.plotting import view_img

# Download pre-trained model
encoder = NeuroQueryModel.from_data_dir(fetch_neuroquery_model())

# Generate brain map from text query
result = encoder("Parkinson's disease")
brain_map = result["brain_map"]

# Visualize
view_img(brain_map, threshold=3.0).open_in_browser()
```

---

#### 6.2.3 pubget (Literature Extraction Pipeline)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neuroquery/pubget |
| **License** | MIT License |
| **Stars** | ~33 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.8+ |
| **Installation** | `pip install pubget` |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Command-line tool for downloading PubMed Central articles and extracting text, metadata, and stereotactic coordinates. Can fit NeuroQuery and NeuroSynth models. Outputs compatible with NiMARE. Good for building custom meta-analytic datasets. |

```bash
# Download and process fMRI articles
pubget run ./pubget_data -q "fMRI[title]" --n_jobs 4

# Optional: fit NeuroQuery model
pubget fit_neuroquery ./pubget_data/...
```

---

#### 6.2.4 PyMARE (Python Meta-Analysis & Regression Engine)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neurostuff/PyMARE |
| **License** | MIT License |
| **Stars** | ~30 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.8+ |
| **Installation** | `pip install pymare` |
| **Recommendation** | **USE** |
| **Rationale** | Domain-agnostic meta-analysis library. Mixed-effects meta-regression (REML, ML, HS, DL, Stouffer's). Effect size computation. Forest plots. Used by NiMARE internally. MIT license. |

```python
# Usage Example - Meta-Regression
import numpy as np
from pymare import meta_regression

y = np.array([-1, 0.5, 0.5, 0.5, 1, 1, 2, 10])  # study estimates
v = np.array([1, 1, 2.4, 0.5, 1, 1, 1.2, 1.5])  # variances
X = np.array([1, 1, 2, 2, 4, 4, 2.8, 2.8])       # covariate

result = meta_regression(
    y, v, X, names=['my_cov'],
    add_intercept=True, method='REML'
)
print(result.to_df())
```

---

#### 6.2.5 Core Neurosynth (Legacy)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/neurosynth/neurosynth |
| **License** | Not specified (assumed MIT/BSD) |
| **Stars** | ~150 |
| **Last Commit** | ~2019 (no longer actively maintained) |
| **Recommendation** | **SKIP** |
| **Rationale** | Legacy package. No longer maintained. Core functionality integrated into NiMARE. NiMARE is the recommended replacement. |

---

### 6.3 Neurosynth/NeuroQuery Stack Summary

| Tool | Verdict | Complexity | Notes |
|------|---------|------------|-------|
| `NiMARE` | USE | Medium | Primary meta-analysis library |
| `neuroquery` | USE | Low | Text-to-brain encoding |
| `pubget` | EVALUATE | Medium | Literature extraction pipeline |
| `PyMARE` | USE | Low | Generic meta-analysis / meta-regression |
| `neurosynth` (legacy) | SKIP | N/A | Replaced by NiMARE |

---

## 7. ADNI / ABIDE Cohort Stack

### 7.1 Overview

PHASE 2 requires access to neuroimaging cohort datasets, specifically:
- ADNI (Alzheimer's Disease Neuroimaging Initiative) - requires data use agreement
- ABIDE (Autism Brain Imaging Data Exchange) - open access
- General neuroimaging cohort preprocessing pipelines

### 7.2 Recommended Tools

#### 7.2.1 nilearn ABIDE Fetcher (fetch_abide_pcp)

| Attribute | Detail |
|-----------|--------|
| **Part of** | `nilearn` |
| **License** | BSD-3-Clause |
| **Recommendation** | **USE** |
| **Rationale** | Built-in fetcher for preprocessed ABIDE data. Multiple pipelines (CPAC, CCS, DPARSF, NIAK). Configurable derivatives (func_preproc, rois_cc200, rois_aal, etc.). Quality-checked filtering. |

```python
# Usage Example - Fetch ABIDE Preprocessed
from nilearn import datasets

abide = datasets.fetch_abide_pcp(
    n_subjects=100,
    pipeline='cpac',
    band_pass_filtering=True,
    global_signal_regression=True,
    derivatives=['func_preproc'],
    quality_checked=True,
    verbose=1
)

print(f"Functional images: {len(abide.func_preproc)}")
print(f"Phenotypic info: {abide.phenotypic.shape}")
```

**Available Pipelines:** cpac, ccs, dparsf, niak
**Available Derivatives:** func_preproc, rois_cc200, rois_cc400, rois_dosenbach160, rois_ez, rois_ho, rois_tt

---

#### 7.2.2 ABIDE Preprocessed Download Scripts

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/peterlipan/ABIDE_dataset_download |
| **License** | Not specified |
| **Stars** | ~10 |
| **Last Commit** | 2021 |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Alternative download scripts for ABIDE I and II. Based on nilearn's fetcher. May offer more flexibility for bulk downloads. |

---

#### 7.2.3 ADNI Data Access (LONI IDA)

| Attribute | Detail |
|-----------|--------|
| **Portal** | https://ida.loni.usc.edu |
| **License** | Data Use Agreement required |
| **Python Access** | No official Python SDK |
| **Recommendation** | **EVALUATE** |
| **Rationale** | ADNI requires application and DUA. No Python API. Download via LONI IDA web interface. Preprocessing requires SPM/FSL/ANTs pipelines. Consider building a custom wrapper. |

```python
# Post-download processing with nilearn
from nilearn import image, plotting
import nibabel as nib

# Load ADNI NIfTI files
adni_img = nib.load('ADNI_subject_002.nii')
# Smooth
smoothed = image.smooth_img(adni_img, fwhm=6)
# Plot
plotting.plot_anat(smoothed, title="ADNI T1-weighted")
```

---

#### 7.2.4 nilearn ADHD Dataset (fetch_adhd)

| Attribute | Detail |
|-----------|--------|
| **Part of** | `nilearn` |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Built-in fetcher for ADHD-200 dataset. 40 subjects available via nilearn. Useful for development and testing pipelines. Not full ADNI/ABIDE replacement. |

---

#### 7.2.5 Preprocessed ABIDE Dataset (OpenXAIProject)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/OpenXAIProject/Preprocessed_ABIDE_Dataset |
| **License** | CC BY-SA 3.0 |
| **Stars** | ~50 |
| **Last Commit** | 2018 |
| **Recommendation** | **SKIP** |
| **Rationale** | Preprocessed VBM maps. Stale (2018). Limited utility for functional connectivity analysis. |

---

### 7.3 ADNI/ABIDE Stack Summary

| Tool | Verdict | Complexity | Notes |
|------|---------|------------|-------|
| `nilearn fetch_abide_pcp` | USE | Low | Built-in ABIDE access |
| `ABIDE_dataset_download` | EVALUATE | Medium | Alternative download scripts |
| ADNI (LONI IDA) | EVALUATE | Very High | Requires DUA, no Python API |
| `nilearn fetch_adhd` | EVALUATE | Low | Development/testing dataset |
| OpenXAIProject ABIDE | SKIP | Low | Stale, limited utility |

---

## 8. Network Neuroscience Stack

### 8.1 Overview

Network neuroscience tools for brain connectivity analysis include graph-theoretic
measures, network visualization, and connectivity-based statistics. PHASE 2 requires:
(a) graph metrics (degree, centrality, clustering, modularity, path length),
(b) network-based statistics, (c) network construction and visualization.

### 8.2 Recommended Tools

#### 8.2.1 bctpy (Brain Connectivity Toolbox for Python)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/aestrivex/bctpy |
| **License** | GNU GPLv3+ |
| **Stars** | ~200+ |
| **Last Commit** | 2024 |
| **Python Support** | 3.7+ |
| **Installation** | `pip install bctpy` |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Python port of the gold-standard MATLAB BCT toolbox. Pure Python, depends only on numpy/scipy. Implements ~100 graph-theoretic measures. GPLv3+ is copyleft -- evaluate license compatibility. |

```python
# Usage Example - Graph Metrics
import numpy as np
import bct

# Create sample connectivity matrix (weighted, undirected)
np.random.seed(42)
W = np.random.rand(100, 100)
W = (W + W.T) / 2  # Symmetrize
np.fill_diagonal(W, 0)

# Degree
deg = bct.degrees_und(W)

# Betweenness centrality
bc = bct.betweenness_wei(W)

# Clustering coefficient
ci = bct.clustering_coef_wu(W)

# Modularity (Louvain)
ci_mod, Q = bct.modularity_und(W)

# Characteristic path length
L = bct.charpath(bct.distance_wei(W)[0])[0]

# Efficiency
E = bct.efficiency_wei(W)
```

**Key Modules:**
- `bct.degree` - Degree, strength, joint degree
- `bct.centrality` - Betweenness, eigenvector, Katz, pagerank
- `bct.clustering` - Clustering coefficient, transitivity
- `bct.distance` - Path length, efficiency, eccentricity, radius, diameter
- `bct.modularity` - Louvain, Newman, modularity optimization
- `bct.core` - K-core decomposition, s-core
- `bct.motifs` - Network motifs
- `bct.physical_connectivity` - Density, spanning tree
- `bct.similarity` - Similarity indices

---

#### 8.2.2 nilearn Connectivity (Functional Connectomes)

| Attribute | Detail |
|-----------|--------|
| **Part of** | `nilearn` |
| **License** | BSD-3-Clause |
| **Recommendation** | **USE** |
| **Rationale** | Built-in connectivity analysis. Multiple estimators (correlation, partial correlation, tangent, covariance). Connectome plotting. Part of the standard neuroimaging workflow. |

```python
# Usage Example - Connectivity Matrices
from nilearn.connectome import ConnectivityMeasure
from nilearn.datasets import fetch_atlas_schaefer_2018
from nilearn.maskers import NiftiLabelsMasker

# Load atlas
atlas = fetch_atlas_schaefer_2018(n_rois=400, yeo_networks=7)

# Extract time series from multiple subjects
masker = NiftiLabelsMasker(labels_img=atlas.maps, standardize=True)
time_series_list = [masker.fit_transform(fmri, confounds=conf)
                    for fmri, conf in zip(func_imgs, confounds_list)]

# Compute connectivity matrices
measure = ConnectivityMeasure(kind='correlation')
correlation_matrices = measure.fit_transform(time_series_list)

# Partial correlation
partial_measure = ConnectivityMeasure(kind='partial correlation')
partial_matrices = partial_measure.fit_transform(time_series_list)
```

---

#### 8.2.3 netneurotools (Network Neuroscience Utilities)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/netneurolab/netneurotools |
| **License** | BSD-3-Clause |
| **Stars** | ~114 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.8+ |
| **Installation** | `pip install netneurotools` |
| **Recommendation** | **USE** |
| **Rationale** | Collection of utility functions from the Network Neuroscience Lab at McGill. Network construction (empirical + surrogate), graph metrics, brain visualization, statistics. BSD-3-Clause. Active development. Well-documented. |

**Key Features:**
- Dataset fetchers (freesurfer, yeo networks, schaefer, etc.)
- Network construction from time series
- Graph metric calculations
- Surrogate network generation (spin tests, etc.)
- Brain surface visualization
- Statistical testing for network comparisons

```python
# Usage Example
import netneurotools as nnt
from netneurotools import datasets, utils

# Fetch Schaefer 2018 atlas
atlas, info = datasets.fetch_schaefer_2018(
    n_rois=400, yeo_networks=7
)

# Generate spin permutations for null model
spins = utils.get_perm_rotations(
    coords=info['centroids'],
    n_rotate=1000,
    seed=42
)
```

---

#### 8.2.4 brainconn (brainconn fork of bctpy)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/vandal-uv/brainconn |
| **License** | GNU GPLv3 |
| **Stars** | ~30 |
| **Last Commit** | ~2021 (stale) |
| **Recommendation** | **SKIP** |
| **Rationale** | Fork of bctpy with some improvements. Stale (2021). bctpy is more actively maintained. Same GPL license concerns. |

---

#### 8.2.5 BrainSpace (Gradient Mapping)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/MICA-MNI/BrainSpace |
| **License** | BSD-3-Clause |
| **Stars** | ~83 |
| **Last Commit** | 2025 (active) |
| **Python Support** | 3.8+ |
| **Installation** | `pip install brainspace` |
| **Recommendation** | **EVALUATE** |
| **Rationale** | Cross-platform toolbox for macroscale gradient mapping and analysis. Python and MATLAB versions. Spatial null models. Gradient correspondence analysis. Good for advanced connectivity gradient analysis. BSD-3-Clause. |

```python
# Usage Example - Diffusion Map Gradients
from brainspace.gradient import GradientMaps
from brainspace.datasets import load_group_fc
import numpy as np

# Load functional connectivity matrix
fc_matrix = load_group_fc('schaefer', scale=400)

# Compute diffusion map gradients
gm = GradientMaps(n_components=10, approach='dm', kernel='normalized_angle')
gm.fit(fc_matrix)

# First gradient
g1 = gm.gradients_[:, 0]
```

---

#### 8.2.6 NetworkX (General Graph Library)

| Attribute | Detail |
|-----------|--------|
| **Repository** | https://github.com/networkx/networkx |
| **License** | BSD-3-Clause |
| **Stars** | ~14,000+ |
| **Last Commit** | 2025 (very active) |
| **Python Support** | 3.10+ |
| **Installation** | `pip install networkx` |
| **Recommendation** | **USE** |
| **Rationale** | General-purpose graph library. Good for network construction, basic metrics, and visualization. Not neuroimaging-specific but widely used. Excellent for integration with other tools. BSD-3-Clause. Very active. |

```python
# Usage Example with NetworkX
import networkx as nx
import numpy as np

# Create graph from connectivity matrix
W = np.random.rand(100, 100)
W = (W + W.T) / 2
np.fill_diagonal(W, 0)
G = nx.from_numpy_array(W)

# NetworkX metrics
degree = dict(nx.degree(G, weight='weight'))
betweenness = nx.betweenness_centrality(G, weight='weight')
clustering = nx.clustering(G, weight='weight')
path_length = nx.average_shortest_path_length(G, weight='weight')
```

---

### 8.3 Network Neuroscience Stack Summary

| Tool | Verdict | Complexity | License |
|------|---------|------------|---------|
| `bctpy` | EVALUATE | Medium | GPLv3 (copyleft) |
| `nilearn` connectivity | USE | Low | BSD-3-Clause |
| `netneurotools` | USE | Medium | BSD-3-Clause |
| `brainconn` | SKIP | Medium | GPLv3 (stale) |
| `BrainSpace` | EVALUATE | Medium | BSD-3-Clause |
| `NetworkX` | USE | Low | BSD-3-Clause |

---

## 9. Recommended Integration Stack

### 9.1 Tier 1: USE (Production-Ready)

| # | Package | Category | Install Command | License |
|---|---------|----------|-----------------|---------|
| 1 | `nilearn` | Atlases, Connectivity, ABIDE | `pip install nilearn` | BSD-3-Clause |
| 2 | `nimare` | Meta-analysis | `pip install nimare` | MIT |
| 3 | `neuroquery` | Text-to-brain encoding | `pip install neuroquery` | BSD-3-Clause |
| 4 | `pymare` | Generic meta-analysis | `pip install pymare` | MIT |
| 5 | `netneurotools` | Network neuroscience | `pip install netneurotools` | BSD-3-Clause |
| 6 | `networkx` | Graph theory | `pip install networkx` | BSD-3-Clause |
| 7 | `allensdk` | Allen Brain Atlas | `pip install allensdk` | BSD-3-Clause* |
| 8 | `openFDA API` | Adverse events | `requests` (built-in) | Public Domain |

### 9.2 Tier 2: EVALUATE (Needs Testing)

| # | Package | Category | Install Command | License |
|---|---------|----------|-----------------|---------|
| 9 | `vigipy` | Signal detection | `git clone + pip install` | GPLv3 |
| 10 | `bctpy` | Graph metrics | `pip install bctpy` | GPLv3 |
| 11 | `OnSIDES` | Drug label ADE data | Data download | MIT |
| 12 | `OnSIDES Web` | ADE API | Self-host Flask | MIT |
| 13 | `pubget` | Literature extraction | `pip install pubget` | MIT |
| 14 | `BrainSpace` | Gradient mapping | `pip install brainspace` | BSD-3-Clause |
| 15 | `neurocaps` | Parcellation wrapper | `pip install neurocaps` | Unknown |
| 16 | `FAERS_PHARMACOVIGILANCE_ANALYSIS` | Reference implementation | Git clone | Unknown |

### 9.3 Tier 3: SKIP (Stale/Incompatible)

| # | Package | Reason |
|---|---------|--------|
| 17 | `FAERS-Toolkit` | Stale (2019), incomplete |
| 18 | `djm-35/faers-data` | Very stale (2015) |
| 19 | `neurosynth` (legacy) | Replaced by NiMARE |
| 20 | `brainconn` | Stale (2021), bctpy preferred |
| 21 | `benfulcher/AllenSDK` | MATLAB dependency, stale |
| 22 | `OpenXAIProject ABIDE` | Stale (2018) |

### 9.4 Complete Integration Environment

```bash
# Create conda environment
conda create -n deepsynaps-phase2 python=3.11
conda activate deepsynaps-phase2

# Tier 1: Core production stack
pip install nilearn nimare neuroquery pymare netneurotools networkx

# Allen Brain Atlas SDK
pip install allensdk

# OnSIDES data access (download from GitHub releases)
# wget https://github.com/tatonetti-lab/onsides/releases/download/v3.1.0-20250401/onsides_v3.1.0_20250401.tar.gz

# Optional: gradient mapping
pip install brainspace

# Optional: literature extraction pipeline
pip install pubget

# Optional: high-level parcellation wrapper
pip install neurocaps

# Signal detection (EVALUATE - GPLv3)
# git clone https://github.com/Shakesbeery/vigipy.git
# cd vigipy && python setup.py bdist_wheel && pip install dist/*.whl

# Graph metrics (EVALUATE - GPLv3)
pip install bctpy
```

---

## 10. Licensing Compliance Matrix

### 10.1 License Summary by Tool

| Tool | License | OSI Approved | Copyleft | Commercial Use | Attribution Required | Risk Level |
|------|---------|-------------|----------|---------------|---------------------|------------|
| `nilearn` | BSD-3-Clause | Yes | No | Yes | Yes | **LOW** |
| `nimare` | MIT | Yes | No | Yes | Yes | **LOW** |
| `neuroquery` | BSD-3-Clause | Yes | No | Yes | Yes | **LOW** |
| `pymare` | MIT | Yes | No | Yes | Yes | **LOW** |
| `netneurotools` | BSD-3-Clause | Yes | No | Yes | Yes | **LOW** |
| `networkx` | BSD-3-Clause | Yes | No | Yes | Yes | **LOW** |
| `allensdk` | BSD-3-Clause* | Partial | No | Restricted | Yes | **MEDIUM** |
| `pubget` | MIT | Yes | No | Yes | Yes | **LOW** |
| `OnSIDES` | MIT | Yes | No | Yes | Yes | **LOW** |
| `BrainSpace` | BSD-3-Clause | Yes | No | Yes | Yes | **LOW** |
| `bctpy` | GPLv3+ | Yes | Yes | Yes | Same license | **HIGH** |
| `vigipy` | GPLv3 | Yes | Yes | Yes | Same license | **HIGH** |
| `brainconn` | GPLv3 | Yes | Yes | Yes | Same license | **HIGH** |
| `openFDA API` | Public Domain | N/A | No | Yes | No | **NONE** |

### 10.2 Key Licensing Notes

1. **BSD-3-Clause and MIT tools (LOW risk):** Can be freely integrated into
   proprietary/commercial products. Attribution required in documentation.

2. **GPLv3 tools (HIGH risk):** vigipy, bctpy, brainconn are copyleft.
   Integration into a proprietary product requires either:
   - Releasing PHASE 2 source code under GPLv3
   - Using them as **microservices** (API call, not linked code)
   - Finding alternative implementations

3. **AllenSDK special clause (MEDIUM risk):** The AllenSDK has a third BSD clause
   that prohibits commercial use without Allen Institute written permission.
   For commercial deployment, contact terms@alleninstitute.org.

4. **openFDA API (NO risk):** US Government work is in the public domain.
   No restrictions on use.

### 10.3 Recommended GPL Mitigation Strategy

```
+--------------------------------------+
|         DeepSynaps PHASE 2            |
|      (Proprietary / BSD License)      |
+--------------------------------------+
              | REST API
              v
+-------------------+  +-------------------+
|  vigipy service   |  |   bctpy service   |
|   (GPLv3 - OK)    |  |   (GPLv3 - OK)    |
|  Docker container |  |  Docker container |
+-------------------+  +-------------------+
```

Running GPLv3 tools as separate microservices accessed via REST API avoids
copyleft contamination of the main codebase.

---

## 11. Implementation Priority

### 11.1 Phase 2A: Foundation (Weeks 1-2)

| Priority | Task | Tools |
|----------|------|-------|
| P0 | Set up conda environment with core dependencies | nilearn, numpy, scipy, pandas, scikit-learn |
| P0 | Install and test nilearn Schaefer loader | `fetch_atlas_schaefer_2018` |
| P0 | Install and test nilearn ABIDE fetcher | `fetch_abide_pcp` |
| P0 | Install and test NiMARE + fetch Neurosynth dataset | `nimare`, `fetch_neurosynth` |
| P0 | Install and test NeuroQuery | `neuroquery`, `fetch_neuroquery_model` |

### 11.2 Phase 2B: Integration (Weeks 3-4)

| Priority | Task | Tools |
|----------|------|-------|
| P1 | Integrate openFDA API client | `requests` |
| P1 | Download and integrate OnSIDES database | OnSIDES SQLite release |
| P1 | Install and test AllenSDK | `allensdk` |
| P1 | Integrate netneurotools for network analysis | `netneurotools` |
| P1 | Set up NetworkX for graph operations | `networkx` |

### 11.3 Phase 2C: Advanced (Weeks 5-6)

| Priority | Task | Tools |
|----------|------|-------|
| P2 | Evaluate vigipy for signal detection (GPL risk) | `vigipy` |
| P2 | Evaluate bctpy for graph metrics (GPL risk) | `bctpy` |
| P2 | Evaluate BrainSpace for gradient analysis | `BrainSpace` |
| P2 | Evaluate pubget for literature extraction | `pubget` |
| P2 | Set up PyMARE for meta-regression | `pymare` |

### 11.4 Phase 2D: Polish (Weeks 7-8)

| Priority | Task | Tools |
|----------|------|-------|
| P3 | Build GPLv3 microservice wrappers (if needed) | Docker + REST API |
| P3 | Performance optimization and caching | Redis/PostgreSQL |
| P3 | Documentation and testing | pytest, sphinx |
| P3 | License compliance audit | Legal review |

---

## 12. Risks & Mitigations

### 12.1 Licensing Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPLv3 contamination (vigipy, bctpy) | HIGH | Use as microservices via REST API; or reimplement core algorithms in BSD code |
| AllenSDK commercial clause | MEDIUM | Contact Allen Institute for commercial license; build fallback data loader |
| OnSIDES data license | LOW | MIT license, academic use permitted. Confirm for commercial use |

### 12.2 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| AllenSDK in maintenance mode | MEDIUM | Fork and maintain critical fixes; monitor for community takeover |
| NeuroQuery archived (Aug 2025) | MEDIUM | Core model is stable; monitor NiMARE for equivalent functionality |
| FAERS data size (multi-GB quarterly) | MEDIUM | Implement incremental loading; use SQLite/PostgreSQL with indexing |
| ABIDE download reliability | LOW | Implement retry logic; use S3 direct download as fallback |
| bctpy beta quality (potential bugs) | MEDIUM | Cross-validate results against MATLAB BCT; add unit tests |

### 12.3 Dependency Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| vigipy pins old pandas (2.2.2) | LOW | Test with newer pandas; contribute PRs upstream |
| AllenSDK complex dependency tree | MEDIUM | Use conda-forge distribution; pin working versions |
| nilearn rapid evolution | LOW | Pin minor version; follow deprecation notices |

### 12.4 Data Access Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ADNI requires data use agreement | HIGH | Submit application early; consider open alternatives (OASIS) |
| openFDA API rate limits | LOW | Request API key for 120K req/day; implement caching |
| OnSIDES NLP pipeline complexity | LOW | Use pre-built data releases; avoid full rebuild unless necessary |

### 12.5 Integration Risk Matrix

```
                    High Impact
                         |
    [ADNI DUA]           |        [GPL license]
    [AllenSDK maint]     |        [FAERS data size]
                         |
Low Probability ---------+--------- High Probability
                         |
    [ABIDE download]     |        [openFDA rate limits]
    [NeuroQuery archive] |        [Dependency pins]
                         |
                    Low Impact
```

### 12.6 Contingency Plans

1. **If GPLv3 is unacceptable:** Implement core PRR/ROR algorithms directly in
   DeepSynaps codebase (mathematically straightforward). Use `nilearn` graph
   functions as alternative to `bctpy`.

2. **If AllenSDK fails:** Use direct REST API calls to Allen Brain Map API
   (documented, stable) instead of the SDK.

3. **If NeuroQuery breaks:** Use NiMARE's functional decoding capabilities as
   fallback for term-to-brain mapping.

4. **If ADNI access is delayed:** Use ABIDE, ADHD-200, and OASIS as
   development datasets while waiting for ADNI approval.

---

## Appendix A: Complete Tool Inventory

| # | Tool | Category | License | Verdict | Repo/URL |
|---|------|----------|---------|---------|----------|
| 1 | nilearn | Atlas/Connectivity | BSD-3 | USE | github.com/nilearn/nilearn |
| 2 | nimare | Meta-analysis | MIT | USE | github.com/neurostuff/NiMARE |
| 3 | neuroquery | Text-to-brain | BSD-3 | USE | github.com/neuroquery/neuroquery |
| 4 | pymare | Meta-regression | MIT | USE | github.com/neurostuff/PyMARE |
| 5 | netneurotools | Network utils | BSD-3 | USE | github.com/netneurolab/netneurotools |
| 6 | networkx | Graph theory | BSD-3 | USE | github.com/networkx/networkx |
| 7 | allensdk | Allen Atlas | BSD-3* | USE | github.com/AllenInstitute/AllenSDK |
| 8 | openFDA API | Drug events | Public | USE | api.fda.gov |
| 9 | vigipy | Signal detection | GPLv3 | EVAL | github.com/Shakesbeery/vigipy |
| 10 | bctpy | Graph metrics | GPLv3 | EVAL | github.com/aestrivex/bctpy |
| 11 | OnSIDES | Drug label ADEs | MIT | EVAL | github.com/tatonetti-lab/onsides |
| 12 | OnSIDES Web | ADE web API | MIT | EVAL | github.com/tatonetti-lab/onsides-web |
| 13 | pubget | Literature extraction | MIT | EVAL | github.com/neuroquery/pubget |
| 14 | BrainSpace | Gradient mapping | BSD-3 | EVAL | github.com/MICA-MNI/BrainSpace |
| 15 | neurocaps | Parcellation wrapper | ? | EVAL | neurocaps.readthedocs.io |
| 16 | FAERS_PHARMACOVIGILANCE | Reference impl | ? | EVAL | github.com/DSimoens/FAERS_PHARMACOVIGILANCE_ANALYSIS |
| 17 | openfda-faers | API notebook | ? | EVAL | github.com/neksa/openfda-faers |
| 18 | Bioconductor faers | FAERS parser (R) | Artistic-2.0 | EVAL | github.com/WangLabCSU/faers |
| 19 | niazch/canada-vigilance | Drug normalization | ? | EVAL | github.com/niazch/canada-vigilance-med-norm |
| 20 | FAERS-Toolkit | FAERS parser | ? | SKIP | github.com/kylechua/faers-toolkit |
| 21 | djm-35/faers-data | FAERS parser | MIT | SKIP | github.com/djm-35/faers-data |
| 22 | neurosynth (legacy) | Meta-analysis | ? | SKIP | github.com/neurosynth/neurosynth |
| 23 | brainconn | Graph metrics | GPLv3 | SKIP | github.com/vandal-uv/brainconn |
| 24 | benfulcher/AllenSDK | Gene expr pipeline | ? | SKIP | github.com/benfulcher/AllenSDK |
| 25 | OpenXAIProject/ABIDE | Preprocessed ABIDE | CC-BY-SA | SKIP | github.com/OpenXAIProject/Preprocessed_ABIDE_Dataset |
| 26 | bmtk | Neural modeling | BSD-3 | EVAL | github.com/AllenInstitute/bmtk |

## Appendix B: Quick Reference Card

### Signal Detection (FAERS)
```python
# PRR = (a/(a+b)) / (c/(c+d))
# ROR = (a/b) / (c/d) = ad/bc
# EBGM - Empirical Bayes Geometric Mean
# IC - Information Component (BCPNN)
```

### Atlas Loading
```python
from nilearn.datasets import fetch_atlas_schaefer_2018
atlas = fetch_atlas_schaefer_2018(n_rois=400, yeo_networks=7)
```

### Meta-Analysis
```python
from nimare.extract import fetch_neurosynth
from nimare.meta.cbma import ALE
```

### Text-to-Brain
```python
from neuroquery import fetch_neuroquery_model, NeuroQueryModel
encoder = NeuroQueryModel.from_data_dir(fetch_neuroquery_model())
result = encoder("depression")
```

### Graph Metrics
```python
import bct
import numpy as np
W = np.random.rand(100, 100)
W = (W + W.T) / 2; np.fill_diagonal(W, 0)
deg = bct.degrees_und(W)
ci, Q = bct.modularity_und(W)
```

### ABIDE Download
```python
from nilearn import datasets
abide = datasets.fetch_abide_pcp(
    n_subjects=100, pipeline='cpac'
)
```

---

**Report compiled by:** Open Source Intelligence Specialist
**For:** DeepSynaps Protocol Studio - PHASE 2 Knowledge Layer
**Date:** 2025-07-14

---

*End of Report*
