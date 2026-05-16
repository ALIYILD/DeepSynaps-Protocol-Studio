# PHASE 2: Brain Atlas & Network Neuroscience Deep Research Report

## DeepSynaps Protocol Studio -- Knowledge Layer Integration

**Version:** 1.0.0  
**Date:** 2025-06-18  
**Scope:** Allen Brain Atlas (ABA) + Schaefer Parcellation + Network Neuroscience  
**Classification:** Technical Integration Research (Research-Only Context)  
**License:** CC BY 4.0 (atlas data) / Internal Use (DeepSynaps Integration)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Allen Brain Atlas Deep Dive](#2-allen-brain-atlas-deep-dive)
3. [Schaefer Parcellation Deep Dive](#3-schaefer-parcellation-deep-dive)
4. [Network Neuroscience Concepts](#4-network-neuroscience-concepts)
5. [Atlas Harmonization Strategies](#5-atlas-harmonization-strategies)
6. [DeepSynaps Integration Architecture](#6-deepsynaps-integration-architecture)
7. [Display Rules & Caveats](#7-display-rules--caveats)
8. [Provenance & Confidence Model](#8-provenance--confidence-model)
9. [DeepTwin Network Integration](#9-deeptwin-network-integration)
10. [Licensing](#10-licensing)
11. [Implementation Recommendations](#11-implementation-recommendations)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This report provides the foundational research and integration architecture for embedding brain atlas biology and network neuroscience into the DeepSynaps Protocol Studio Knowledge Layer. It covers two primary atlas systems -- the Allen Brain Atlas (ABA) for gene-level molecular context and the Schaefer parcellation for functional network topology -- alongside the theoretical framework of network neuroscience that connects them.

### 1.2 Key Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Allen Brain Atlas API Adapter Design | RESTful RMA query system for gene expression data | Specified |
| Schaefer Parcellation Integration | 100-1000 parcel loading with Yeo 7/17 network assignment | Specified |
| Network Neuroscience Framework | Graph theory measures, NBS, seed-based analysis | Documented |
| Atlas Harmonization Layer | Cross-atlas mapping between ABA structures and Schaefer parcels | Designed |
| Display Rules & Governance | Mandatory research-context labeling for all atlas-derived data | Defined |
| DeepTwin Enrichment Spec | Biology + network context for clinical neuromodulation planning | Specified |

### 1.3 Critical Governance Principle

> **ALL atlas-derived data displayed in DeepSynaps is contextual enrichment, never clinical evidence.**
> Gene expression data is population-averaged molecular annotation from ~6 post-mortem donors.
> Network assignments are group-level functional topology labels, not individual patient functional assessments.
> Every atlas data element carries mandatory research-context flags.

### 1.4 Scope Boundaries

- **In scope:** API integration design, data models, code examples, display rules, confidence scoring, network assignment logic
- **Out of scope:** Real-time MRI processing, patient-specific connectivity mapping, direct clinical diagnostic claims
- **Clinical context:** Atlas data is displayed as enrichment alongside neuromodulation protocol planning, never as standalone clinical evidence

---

## 2. Allen Brain Atlas Deep Dive

### 2.1 Overview

The **Allen Brain Atlas** (ABA) is a suite of open-science resources produced by the Allen Institute for Brain Science (Seattle, WA) that maps gene expression, connectivity, and cellular morphology across the brain. For DeepSynaps, the primary resource is the **Allen Human Brain Atlas (AHBA)**, which provides genome-wide gene expression data mapped to ~500 anatomical structures across 6 adult human brains.

**Institution:** Allen Institute for Brain Science  
**Established:** 2003 (mouse), 2010 (human)  
**License:** CC BY 4.0 (open access)  
**API Base URL:** `http://api.brain-map.org/api/v2/`  
**Web Portal:** https://brain-map.org  

### 2.2 Available Datasets

#### 2.2.1 Allen Human Brain Atlas (AHBA)

The flagship dataset for DeepSynaps clinical context integration.

| Attribute | Detail |
|-----------|--------|
| **Modality** | Microarray (primary) + RNA-Seq (supplemental, 2 donors) |
| **Platform** | Custom Agilent 8x60k microarray chip |
| **Donors** | 6 adult control brains (1 female, 5 male) |
| **Age range** | 24-57 years |
| **Gene coverage** | ~20,000 protein-coding genes |
| **Brain structures sampled** | ~500 unique anatomical regions |
| **Total tissue samples** | ~3,700 (microarray) + 240 (RNA-Seq) |
| **Expression values** | Normalized expression level (log2), z-scores |
| **Spatial resolution** | Tissue punch samples (~5mm diameter) |
| **Coordinate system** | MNI152-compatible via MRI co-registration |
| **Probe strategy** | 93% of genes have >=2 probes on different exons |

**Donor list:**
- H0351.2001 -- 55-year-old male
- H0351.2002 -- 31-year-old male
- H0351.1009 -- 49-year-old male
- H0351.1012 -- 47-year-old male
- H0351.1015 -- 49-year-old male
- H0351.1016 -- 24-year-old female

#### 2.2.2 Allen Mouse Brain Atlas (AMBA)

Used for translational research context (mouse-to-human gene homology).

| Attribute | Detail |
|-----------|--------|
| **Modality** | In situ hybridization (ISH) |
| **Gene coverage** | ~20,000 genes |
| **Resolution** | Cellular-level (1 micron pixel) |
| **Reference atlas** | Allen Mouse Brain Reference Atlas |
| **Section planes** | Coronal + sagittal |
| **Data types** | ISH images, expression energy, density, intensity |

#### 2.2.3 Allen Developing Human Brain Atlas (BrainSpan)

Used for developmental context in pediatric neuromodulation scenarios.

| Attribute | Detail |
|-----------|--------|
| **Modality** | RNA-Seq + exon microarray + ISH |
| **Age range** | 8 weeks post-conception to 40 years |
| **Structure coverage** | ~300 distinct structures at midgestation |
| **Developmental stages** | 15+ developmental periods |
| **Use case** | Developmental gene expression trajectories |

#### 2.2.4 Allen Mouse Brain Connectivity Atlas

Used for structural connectivity context.

| Attribute | Detail |
|-----------|--------|
| **Modality** | Viral tracer injections (anterograde/retrograde) |
| **Injection sites** | ~300 cortical + ~100 subcortical |
| **Resolution** | 100 micron voxel |
| **Data types** | Projection density, intensity, volume |

### 2.3 Data Model & API Architecture

The ABA uses a **RESTful Model Access (RMA)** API built on RESTful principles. Data is organized as a hierarchical object model with associations between entities.

#### 2.3.1 Core Data Models

```
Product               -- Experimental study or reference dataset
  |-- Donor            -- Individual brain donor
  |-- Specimen         -- Tissue sample from donor
  |-- SectionDataSet   -- Collection of images for an experiment
  |-- Structure        -- Anatomical region in ontology tree
  |-- Gene             -- Gene entity with probes
  |-- Probe            -- Microarray probe targeting a gene
  |-- SectionImage     -- Individual experimental image
  |-- StructureUnionize -- Aggregated expression statistics per structure
```

#### 2.3.2 Structure Ontology Hierarchy

The AHBA organizes brain structures hierarchically:

```
Brain (id: 4005)
|-- Cerebral cortex (id: 4008)
|   |-- Frontal lobe
|   |   |-- Precentral gyrus
|   |   |-- Middle frontal gyrus
|   |   |-- Superior frontal gyrus
|   |   |-- ...
|   |-- Temporal lobe
|   |   |-- Superior temporal gyrus
|   |   |-- Middle temporal gyrus
|   |   |-- Hippocampus
|   |   |-- ...
|   |-- Parietal lobe
|   |-- Occipital lobe
|   |-- Insula
|   |-- Cingulate gyrus
|
|-- Cerebral nuclei (id: 4288)
|   |-- Striatum
|   |   |-- Caudate
|   |   |-- Putamen
|   |   |-- Nucleus accumbens
|   |-- Pallidum
|   |   |-- Globus pallidus (external)
|   |   |-- Globus pallidus (internal)
|
|-- Brain stem (id: 4696)
|   |-- Midbrain
|   |-- Pons
|   |-- Medulla
|
|-- Cerebellum (id: 4696)
|   |-- Cerebellar cortex
|   |-- Deep cerebellar nuclei
|
|-- White matter (id: 9219)

Total: 12 major divisions -> ~500 fine structures
```

#### 2.3.3 Expression Value Types

| Value Type | Description | Range | Use Case |
|------------|-------------|-------|----------|
| `expression_level` | Normalized log2 expression | Float (typically 5-15) | Absolute expression comparison |
| `z-score` | Standardized expression per probe | Float (centered at 0) | Relative expression within gene |
| `energy` | Expression energy (ISH) | Float (0-255 range) | Regional expression intensity |
| `density` | Expression density (ISH) | Float (0-1) | Fraction of expressing cells |
| `TPM` | Transcripts per million (RNA-Seq) | Float (0+) | Normalized RNA-Seq quantification |

### 2.4 API Endpoints & Query Patterns

#### 2.4.1 Base API URLs

```python
# Primary API endpoints for AHBA
ABA_API_BASE = "http://api.brain-map.org"
RMA_ENDPOINT = f"{ABA_API_BASE}/api/v2/data"

# Key service endpoints
STRUCTURE_GRAPH_ENDPOINT = f"{ABA_API_BASE}/api/v2/structure_graph_download"
TREE_SEARCH_ENDPOINT = f"{ABA_API_BASE}/api/v2/tree_search"
WELL_KNOWN_FILE_ENDPOINT = f"{ABA_API_BASE}/api/v2/well_known_file_download"
GRID_DATA_ENDPOINT = f"{ABA_API_BASE}/grid_data"
SVG_ENDPOINT = f"{ABA_API_BASE}/api/v2/svg"
IMAGE_DOWNLOAD_ENDPOINT = f"{ABA_API_BASE}/api/v2/image_download"
SECTION_IMAGE_DOWNLOAD = f"{ABA_API_BASE}/api/v2/section_image_download"
```

#### 2.4.2 RMA Query Syntax

The RMA API supports model queries, criteria filtering, associations, and data services.

```
Format: http://api.brain-map.org/api/v2/data/{Model}/{id}.{format}
Formats: json, xml, csv
```

**Key query operators:**
- `$eq` -- equals
- `$ne` -- not equals
- `$gt` / `$lt` -- greater/less than
- `$in` -- in list
- `$il` -- case-insensitive like
- `rma::criteria` -- filter conditions
- `rma::include` -- eager-load associations
- `rma::options` -- pagination, sorting, projection
- `only=` / `except=` -- attribute projection

#### 2.4.3 Essential Query Examples

```python
# ============================================================
# EXAMPLE 1: Query all structures in Human Brain Atlas ontology
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=model::Structure,\
  rma::criteria,ontology[name$eq'Human Brain Atlas'],\
  rma::options[num_rows$eqall]

# Returns: All ~500 structures with id, name, acronym, parent_id, graph_order

# ============================================================
# EXAMPLE 2: Query gene information by symbol
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=model::Gene,\
  rma::criteria,[acronym$eq'DRD2'],\
  rma::include,chromosome

# Returns: Gene id, name, acronym, chromosome for Dopamine Receptor D2

# ============================================================
# EXAMPLE 3: Query probes for a specific gene
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=model::Probe,\
  rma::criteria,[probe_type$eq'DNA'],\
  products[abbreviation$eq'HumanMA'],\
  gene[acronym$eq'DRD2'],\
  rma::options[only$eq'probes.id']

# Returns: Probe IDs targeting DRD2 gene

# ============================================================
# EXAMPLE 4: Download expression values for specific gene/structure
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=service::human_microarray_expression\
  [probes$eq{probe_ids}]\
  [donors$eq{donor_ids}]\
  [structures$eq{structure_id}]

# Returns: Expression levels and z-scores for specified probes

# ============================================================
# EXAMPLE 5: Differential search (higher in target vs contrast)
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=service::human_microarray_differential\
  [structures1$eq{contrast_structure_ids}]\
  [structures2$eq{target_structure_ids}]\
  [sort_by$eq'fold-change']

# Returns: Genes ranked by fold-change between regions

# ============================================================
# EXAMPLE 6: Correlative search (genes co-expressed with seed)
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=service::human_microarray_correlation\
  [probes$eq{seed_probe_id}]\
  [structures$eq{structure_id}]

# Returns: Probes ranked by Pearson correlation with seed probe

# ============================================================
# EXAMPLE 7: Download structure unionization (aggregate stats)
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=model::StructureUnionize,\
  rma::criteria,section_data_set(genes[acronym$eq'DRD2']),\
  rma::include,structure,section_data_set(genes),\
  rma::options[num_rows$eqall]

# Returns: Expression energy per structure for DRD2 across all donors

# ============================================================
# EXAMPLE 8: Query all donors in Human Microarray product
# ============================================================
GET http://api.brain-map.org/api/v2/data/query.json?\
  criteria=model::Donor,\
  rma::criteria,products[abbreviation$eq'HumanMA'],\
  rma::options[only$eq'donors.id,donors.name,donors.age']

# Returns: Donor metadata (id, name, age, sex)
```

#### 2.4.4 AllenSDK (Python Library)

```python
# Install: pip install allensdk
from allensdk.api.queries.mouse_connectivity_api import MouseConnectivityApi
from allensdk.api.queries.mouse_genes_api import MouseGenesApi

# AllenSDK provides higher-level Python interfaces
# Key classes for AHBA:
# - HumanMicroarrayData: Expression data loading
# - StructureTree: Ontology navigation
# - ReferenceSpace: Spatial operations

# Note: For the Human Brain Atlas, direct RMA queries are often
# preferred over AllenSDK due to SDK limitations with human data.
```

### 2.5 Response Data Format

The expression service returns structured JSON with probe and sample metadata:

```json
{
  "probes": [
    {
      "id": 1023146,
      "name": "A_23_P358345",
      "gene-id": 6494,
      "gene-symbol": "SLC6A2",
      "gene-name": "solute carrier family 6...",
      "entrez-id": 6530,
      "expression_level": ["13.2802", "13.9603", "13.9650"],
      "z-score": ["9.3381", "9.8663", "9.8700"]
    }
  ],
  "samples": [
    {
      "donor": {
        "id": 15496,
        "name": "H0351.1015",
        "age": "49 years"
      },
      "sample": {
        "well": 148955246,
        "mri": [95, 121, 126]
      },
      "structure": {
        "id": 9149,
        "name": "locus ceruleus, Left",
        "abbreviation": "LC"
      },
      "top_level_structure": {
        "id": 9135,
        "name": "Pontine Tegmentum"
      }
    }
  ]
}
```

### 2.6 Key Parameters Reference

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `structure_id` | Integer | Unique anatomical structure ID | 9149 (locus ceruleus) |
| `gene_id` | Integer | Gene entity ID | 6494 (SLC6A2) |
| `probe_id` | Integer | Microarray probe ID | 1023146 |
| `section_image_id` | Integer | ISH image identifier | 74819671 |
| `donor_id` | Integer | Brain donor identifier | 15496 |
| `ontology` | String | Structure ontology name | "Human Brain Atlas" |
| `product_id` | Integer | Product/dataset identifier | 3 (Mouse), HumanMA |
| `acronym` | String | Gene symbol | "DRD2", "COMT", "BDNF" |
| `entrez_id` | Integer | NCBI Entrez Gene ID | 6530 |

### 2.7 Clinically Relevant Gene Sets

For neuromodulation context, the following gene families are most relevant:

| Gene Family | Examples | Relevance |
|-------------|----------|-----------|
| **Dopaminergic** | DRD1, DRD2, DRD3, DRD4, DRD5, TH, COMT, DAT | Motor, reward, psychosis |
| **Serotonergic** | HTR1A, HTR2A, HTR2C, SLC6A4, TPH1, TPH2 | Mood, anxiety, cognition |
| **Glutamatergic** | GRIN1, GRIN2A, GRIN2B, GRIA1, GRM5 | Excitatory transmission |
| **GABAergic** | GAD1, GAD2, GABRA1, GABRA2, GABRB2 | Inhibitory transmission |
| **Cholinergic** | CHAT, CHRM1-CHRM5, ACHE | Attention, memory |
| **Noradrenergic** | SLC6A2, ADRA1A, ADRA2A | Arousal, attention |
| **Neuroplasticity** | BDNF, NTRK2, ARC, CREB1 | Synaptic plasticity |
| **Neuroinflammation** | GFAP, IBA1, TNF, IL6, IL1B | Microglial markers |
| **Ion channels** | SCN1A, KCNQ1, CACNA1C, HCN1 | Excitability |
| **Synaptic** | SYN1, SNAP25, VAMP1, SYP | Synaptic markers |

---

## 3. Schaefer Parcellation Deep Dive

### 3.1 Overview

The **Schaefer 2018 parcellation** is a data-driven cortical parcellation that divides the human cerebral cortex into functionally homogeneous parcels based on resting-state functional connectivity. It is built on the Yeo 2011 network framework and provides a nested hierarchy of resolutions from 100 to 1000 parcels, each annotated with network membership.

**Authors:** Schaefer et al., 2018  
**Foundation:** Yeo et al., 2011 (7/17 network solutions)  
**Data source:** 1,489 subjects resting-state fMRI  
**Surface space:** fs_LR_32k (HCP-compatible)  
**Volume space:** MNI152 (1mm and 2mm)  
**License:** CC BY 4.0  

### 3.2 Available Resolutions

| Parcel Count | Hemisphere | Total (Bilateral) | Use Case |
|-------------|------------|-------------------|----------|
| 100 | 50 | 100 | Coarse network-level analysis |
| 200 | 100 | 200 | Balanced resolution for clinical mapping |
| 300 | 150 | 300 | Intermediate granularity |
| 400 | 200 | 400 | Standard research resolution |
| 500 | 250 | 500 | High-resolution clinical |
| 600 | 300 | 600 | Detailed network analysis |
| 800 | 400 | 800 | High-resolution research |
| 1000 | 500 | 1000 | Maximum cortical granularity |

**Note:** The Schaefer parcellation includes **only cortical regions** (no subcortex, cerebellum, or brainstem). For subcortical coverage, additional atlases (e.g., Harvard-Oxford, Tian subcortical) must be combined.

### 3.3 Yeo 7-Network Solution

The 7-network assignment organizes parcels into major functional systems:

| Network # | Name | Abbreviation | Key Regions | Cognitive Domain |
|-----------|------|-------------|-------------|-----------------|
| 1 | **Visual** | Vis | V1, V2, V3, V4, MT+ | Visual processing |
| 2 | **Somatomotor** | SomMot | Precentral, postcentral, SMA, insula | Sensorimotor integration |
| 3 | **Dorsal Attention** | DorsAttn | IPS, FEF, MT+, SPL | Top-down attention |
| 4 | **Ventral Attention** | VentAttn | TPJ, IFG, STG, middle frontal | Bottom-up/salience detection |
| 5 | **Limbic** | Limbic | OFC, temporal pole, medial temporal | Emotion, motivation, memory |
| 6 | **Frontoparietal** | FrontPar | DLPFC, IPL, ACC, pre-SMA | Executive control, working memory |
| 7 | **Default** | Default | MPFC, PCC, angular gyrus, MTL | Self-referential, mind-wandering |

### 3.4 Yeo 17-Network Solution

The 17-network solution provides finer subdivisions:

| Network # | Name | Parent 7-Network |
|-----------|------|-----------------|
| 1 | VisCent (Visual Central) | Visual |
| 2 | VisPeri (Visual Peripheral) | Visual |
| 3 | SomMotA (Somatomotor A) | Somatomotor |
| 4 | SomMotB (Somatomotor B) | Somatomotor |
| 5 | DorsAttnA (Dorsal Attention A) | Dorsal Attention |
| 6 | DorsAttnB (Dorsal Attention B) | Dorsal Attention |
| 7 | Sal/VentAttnA (Salience/Ventral Attention A) | Ventral Attention |
| 8 | Sal/VentAttnB (Salience/Ventral Attention B) | Ventral Attention |
| 9 | LimbicA (Limbic A - temporo-orbital) | Limbic |
| 10 | LimbicB (Limbic B - medial temporal) | Limbic |
| 11 | ContA (Control/Frontoparietal A) | Frontoparietal |
| 12 | ContB (Control/Frontoparietal B) | Frontoparietal |
| 13 | ContC (Control/Frontoparietal C) | Frontoparietal |
| 14 | DefaultA (Default A - medial prefrontal) | Default |
| 15 | DefaultB (Default B - medial posterior) | Default |
| 16 | DefaultC (Default C - lateral temporal) | Default |
| 17 | TempPar (Temporal-Parietal) | Ventral Attention |

### 3.5 Parcellation Algorithm

The Schaefer parcellation is derived through a multi-step algorithm:

1. **Functional fingerprint computation:** Each cortical vertex's normalized functional connectivity profile (Pearson correlations with all other vertices) serves as its feature vector.

2. **Edge detection:** Local connectivity boundaries are detected via abrupt changes in functional connectivity patterns.

3. **von Mises-Fisher (vMF) clustering:** Parcels are formed via vMF mixture modeling on normalized connectivity vectors, with spatial contiguity constraints on the cortical surface.

4. **Consensus clustering:** Multiple clustering solutions are aggregated using the Strehl & Ghosh (2002) consensus method for stability.

5. **Network assignment:** Each parcel is assigned to its dominant Yeo network based on maximal connectivity overlap.

### 3.6 Atlas File Format

The Schaefer atlas is distributed in the following formats:

**Volume (NIfTI):**
```
Schaefer2018_{N}Parcels_{7or17}Networks_order_FSLMNI152_{1or2}mm.nii.gz
```

**Surface (CIFTI/GIFTI):**
```
Schaefer2018_{N}Parcels_{7or17}Networks_order.dlabel.nii
```

**Label file (TSV):**
```
Schaefer2018_{N}Parcels_{7or17}Networks_order.txt
```

**Label format (each line):**
```
<parcel_index>  <label_name>  <network_assignment>  <hemisphere>  <x>  <y>  <z>
```

Example labels:
```
1   7Networks_LH_Vis_1   1   LH   -8.5  -78.5   6.5
2   7Networks_LH_Vis_2   1   LH  -22.5  -68.5  -3.5
51  7Networks_LH_SomMot_1  2   LH  -42.5  -20.5   52.5
101 7Networks_RH_Vis_1    1   RH    8.5  -78.5    6.5
201 7Networks_LH_Default_1  7  LH   -6.5   52.5   -0.5
```

### 3.7 Loading with Nilearn

```python
# ============================================================
# Schaefer Atlas Loading - Complete Examples
# ============================================================

from nilearn.datasets import fetch_atlas_schaefer_2018
from nilearn.plotting import plot_roi
import nibabel as nib
import pandas as pd

# --- Basic loading: 400 parcels, 7 networks, 1mm resolution ---
atlas_400_7 = fetch_atlas_schaefer_2018(
    n_rois=400,
    yeo_networks=7,
    resolution_mm=1,
    data_dir=None,  # uses ~/nilearn_data
    verbose=1
)

# Returns a Bunch with:
# - atlas.maps: path to NIfTI parcellation image
# - atlas.labels: list of ROI label strings
# - atlas.description: textual description

print(f"Maps path: {atlas_400_7.maps}")
print(f"Number of ROIs: {len(atlas_400_7.labels)}")
print(f"First 5 labels: {atlas_400_7.labels[:5]}")

# --- All available resolutions ---
resolutions = [100, 200, 300, 400, 500, 600, 800, 1000]
for n_rois in resolutions:
    atlas = fetch_atlas_schaefer_2018(n_rois=n_rois, yeo_networks=7, resolution_mm=1)
    print(f"{n_rois} parcels -> {len(atlas.labels)} labels")

# --- Loading labels with network parsing ---
def parse_schaefer_labels(atlas_bunch):
    """Parse Schaefer labels into structured DataFrame."""
    records = []
    for idx, label in enumerate(atlas_bunch.labels):
        # Parse label format: 7Networks_LH_Visual_1
        parts = label.split('_')
        network_version = parts[0]  # 7Networks or 17Networks
        hemi = parts[1]             # LH or RH
        network_name = parts[2]     # Vis, SomMot, DorsAttn, etc.
        parcel_num = '_'.join(parts[3:]) if len(parts) > 3 else str(idx)
        
        records.append({
            'parcel_index': idx + 1,  # 1-based indexing
            'full_label': label,
            'network_version': network_version,
            'hemisphere': hemi,
            'network_name': network_name,
            'parcel_subnum': parcel_num,
            'network_index': None  # Will be derived from ordering
        })
    return pd.DataFrame(records)

labels_df = parse_schaefer_labels(atlas_400_7)
print(labels_df.groupby('network_name').size())

# --- 17-network version ---
atlas_400_17 = fetch_atlas_schaefer_2018(
    n_rois=400,
    yeo_networks=17,
    resolution_mm=1
)
print(f"17-network labels (first 3): {atlas_400_17.labels[:3]}")

# --- Plotting ---
plot_roi(atlas_400_7.maps, title="Schaefer 400 - 7 Networks")

# --- Extract MNI coordinates for each parcel ---
def get_parcel_centroids(atlas_img, labels):
    """Compute MNI centroid for each parcel."""
    import numpy as np
    from scipy import ndimage
    
    data = atlas_img.get_fdata()
    affine = atlas_img.affine
    
    centroids = []
    for roi_idx in range(1, len(labels) + 1):
        mask = data == roi_idx
        if mask.sum() > 0:
            # Compute center of mass in voxel space
            com_voxel = ndimage.center_of_mass(mask)
            # Convert to MNI space
            com_mni = nib.affines.apply_affine(affine, com_voxel)
            centroids.append(com_mni)
        else:
            centroids.append([np.nan, np.nan, np.nan])
    return np.array(centroids)

atlas_img = nib.load(atlas_400_7.maps)
centroids = get_parcel_centroids(atlas_img, atlas_400_7.labels)
print(f"Centroid for first parcel: MNI {centroids[0]}")
```

### 3.8 Network Color Coding

```python
# Standard Yeo 7-network colors
YEO_7_NETWORK_COLORS = {
    'Vis':        (120,  18, 134),   # Purple
    'SomMot':     (70,  130, 180),   # Blue
    'DorsAttn':   (0,   118,  14),   # Green
    'VentAttn':   (196,  58, 250),   # Pink/Violet
    'Limbic':     (220,  20,  60),   # Red
    'FrontPar':   (230, 148,  34),   # Orange
    'Default':    (205,  62,  78),   # Reddish
}

# Yeo 17-network extended colors
YEO_17_NETWORK_COLORS = {
    'VisCent':      (120,  18, 134),
    'VisPeri':      (255, 152, 213),
    'SomMotA':      (70,  130, 180),
    'SomMotB':      (0,    0,  200),
    'DorsAttnA':    (0,   118,  14),
    'DorsAttnB':    (20,  200,  50),
    'SalVentAttnA': (196,  58, 250),
    'SalVentAttnB': (150,   0, 200),
    'LimbicA':      (220,  20,  60),
    'LimbicB':      (200,  50, 100),
    'ContA':        (255, 165,   0),
    'ContB':        (255, 140,   0),
    'ContC':        (230, 148,  34),
    'DefaultA':     (205,  62,  78),
    'DefaultB':     (128,   0,   0),
    'DefaultC':     (200, 100,  50),
    'TempPar':      (100,   0, 100),
}
```

### 3.9 Comparison with Other Atlases

| Atlas | Type | # Regions | Networks | Subcortex | Derivation |
|-------|------|-----------|----------|-----------|------------|
| **Schaefer 2018** | Functional (rs-fMRI) | 100-1000 | Yeo 7/17 | No | vMF clustering |
| **Yeo 2011** | Functional (rs-fMRI) | 7 or 17 | Intrinsic | Partial | Clustering on surface |
| **Glasser 2016** | Multi-modal | 360 | Custom | Partial | Multi-feature clustering |
| **AAL** | Anatomical | 116 | None | Yes | Gyral/sulcal landmarks |
| **Harvard-Oxford** | Anatomical | 112 cortical + 20 subcortical | None | Yes | Probabilistic histology |
| **Destrieux 2009** | Anatomical | ~148 | None | No | Sulcal-gyral patterns |
| **Power 2011** | Functional | 264 | 13 modules | Yes | Meta-analysis + rs-fMRI |
| **Shen 268** | Functional | 268 | None | Yes | Group ICA + clustering |
| **Tian 2020** | Subcortical | 16 | None | Yes | rs-fMRI subcortical |

---

## 4. Network Neuroscience Concepts

### 4.1 Resting-State Functional Connectivity (rs-FC)

Resting-state functional connectivity measures the temporal correlation of spontaneous low-frequency (<0.1 Hz) BOLD signal fluctuations between brain regions in the absence of an explicit task.

**Key principles:**
- Brain regions that communicate functionally tend to show correlated spontaneous fluctuations
- These correlations reflect both direct anatomical connections and polysynaptic pathways
- rs-FC reveals intrinsic functional architecture that persists across tasks and states

**Preprocessing pipeline:**
1. Slice-time correction
2. Motion correction (realignment)
3. Spatial normalization to MNI space
4. Spatial smoothing (typically 6mm FWHM)
5. Temporal filtering (0.01-0.1 Hz bandpass)
6. Nuisance regression (motion parameters, WM/CSF signals, global signal - debated)

**Connectivity estimation:**
```python
# Pearson correlation between region time series
FC_ij = corrcoef(time_series_i, time_series_j)

# Fisher z-transform for normality
z_FC_ij = arctanh(FC_ij)
```

### 4.2 Structural vs Functional Networks

| Aspect | Structural Connectivity | Functional Connectivity |
|--------|------------------------|------------------------|
| **Modality** | DWI/tractography, tracing | rs-fMRI, task-fMRI, MEG/EEG |
| **What it measures** | White matter fiber pathways | Temporal correlations in activity |
| **Causality** | Directional (if known) | Undirected (correlation) |
| **Stability** | Relatively stable across time | Dynamic, state-dependent |
| **Resolution** | ~1-2mm voxel | ~3mm voxel (typical fMRI) |
| **Validation** | Direct anatomical observation | Indirect (correlation != connection) |
| **Clinical use** | Pre-surgical planning | Biomarker for disorders |
| **Graph type** | Typically weighted, sparse | Typically weighted, dense |

### 4.3 Graph Theory Measures

A brain network can be modeled as a graph G = (N, E) where N is the set of nodes (brain regions) and E is the set of edges (connections).

#### 4.3.1 Basic Measures

| Measure | Symbol | Formula | Interpretation |
|---------|--------|---------|----------------|
| **Degree** | k_i | Sum of connections to node i | How well-connected a region is |
| **Strength** | s_i | Sum of edge weights to node i | Weighted connectivity |
| **Clustering Coefficient** | C_i | Fraction of neighbor triangles | Local connectivity density |
| **Path Length** | L_ij | Shortest path between i and j | Efficiency of communication |
| **Characteristic Path Length** | L | Average shortest path | Global network integration |

#### 4.3.2 Centrality Measures

| Measure | Description | Clinical Relevance |
|---------|-------------|-------------------|
| **Degree Centrality** | Number of connections | Identifies highly connected hub regions |
| **Betweenness Centrality** | Fraction of shortest paths through node | Identifies bridge/connecting regions |
| **Eigenvector Centrality** | Centrality weighted by neighbor importance | Identifies influential regions |
| **Closeness Centrality** | Inverse average path length to all nodes | Identifies efficient communicators |
| **PageRank** | Iterative importance propagation | Hierarchical influence ranking |

```python
import numpy as np
import networkx as nx

# Build brain network from connectivity matrix
def build_brain_network(connectivity_matrix, threshold=0.1):
    """Create NetworkX graph from connectivity matrix."""
    n_regions = connectivity_matrix.shape[0]
    G = nx.Graph()
    G.add_nodes_from(range(n_regions))
    
    for i in range(n_regions):
        for j in range(i+1, n_regions):
            weight = connectivity_matrix[i, j]
            if abs(weight) > threshold:
                G.add_edge(i, j, weight=weight)
    return G

# Compute graph measures
def compute_graph_metrics(G):
    """Compute key graph-theoretic metrics."""
    metrics = {}
    
    # Degree centrality
    metrics['degree_centrality'] = nx.degree_centrality(G)
    
    # Betweenness centrality (weighted)
    metrics['betweenness_centrality'] = nx.betweenness_centrality(
        G, weight='weight'
    )
    
    # Eigenvector centrality
    try:
        metrics['eigenvector_centrality'] = nx.eigenvector_centrality(
            G, weight='weight', max_iter=1000
        )
    except nx.PowerIterationFailedConvergence:
        metrics['eigenvector_centrality'] = None
    
    # Clustering coefficient
    metrics['clustering'] = nx.clustering(G, weight='weight')
    
    # Global efficiency
    metrics['global_efficiency'] = nx.global_efficiency(G)
    
    # Local efficiency
    metrics['local_efficiency'] = nx.local_efficiency(G)
    
    # Modularity (using greedy modularity communities)
    communities = nx.community.greedy_modularity_communities(G, weight='weight')
    metrics['communities'] = list(communities)
    metrics['num_communities'] = len(communities)
    
    return metrics
```

#### 4.3.3 Modularity and Community Detection

Modularity (Q) measures the quality of network division into communities:

```
Q = (1/2m) * sum_ij [A_ij - (k_i * k_j / 2m)] * delta(c_i, c_j)
```

where m is total edge weight, A_ij is adjacency matrix, k_i is node degree, delta is community indicator.

**Community detection algorithms:**
- Louvain algorithm (fast, hierarchical)
- Greedy modularity maximization
- Spectral clustering
- Infomap
- Walktrap

**Clinical significance:** Modular organization is altered in psychiatric and neurological disorders (depression, schizophrenia, Alzheimer's, epilepsy).

#### 4.3.4 Global Efficiency and Small-Worldness

```python
# Global efficiency
def global_efficiency(connectivity_matrix):
    """Average inverse shortest path length."""
    n = connectivity_matrix.shape[0]
    # Convert to distance matrix
    D = 1.0 / (connectivity_matrix + np.eye(n) * np.inf)
    # Floyd-Warshall or use NetworkX
    G = nx.from_numpy_array(D)
    return nx.global_efficiency(G)

# Small-worldness: sigma = (C_real / C_random) / (L_real / L_random)
def small_world_coefficient(connectivity_matrix, n_random=10):
    """Compute small-world coefficient."""
    G = nx.from_numpy_array(connectivity_matrix)
    C_real = nx.average_clustering(G)
    L_real = nx.average_shortest_path_length(G)
    
    # Generate random graphs with same degree sequence
    C_randoms = []
    L_randoms = []
    for _ in range(n_random):
        G_random = nx.configuration_model(
            [d for n, d in G.degree()]
        )
        G_random = nx.Graph(G_random)  # Remove multi-edges
        G_random.remove_edges_from(nx.selfloop_edges(G_random))
        C_randoms.append(nx.average_clustering(G_random))
        try:
            L_randoms.append(nx.average_shortest_path_length(G_random))
        except:
            L_randoms.append(np.inf)
    
    C_random = np.mean(C_randoms)
    L_random = np.mean(L_randoms)
    
    sigma = (C_real / C_random) / (L_real / L_random)
    return sigma
```

### 4.4 Network-Based Statistics (NBS)

The Network-Based Statistic (Zalesky et al., 2010) is a method for controlling family-wise error rate when performing mass-univariate testing on every connection in a brain network.

**Principle:** Rather than testing each connection independently, NBS exploits the extent to which significant connections cluster together (are interconnected).

**Algorithm:**
1. Compute test statistic (e.g., t-statistic) for each connection
2. Threshold statistics to identify suprathreshold connections
3. Identify connected components in the suprathreshold graph
4. Compute component size (number of edges or sum of statistics)
5. Build null distribution via permutation testing
6. Assign p-values to each component based on null distribution

```python
# NBS pseudo-code (conceptual)
def network_based_statistic(conn_group1, conn_group2, threshold=3.0, n_permutations=5000):
    """
    Network-Based Statistic for group comparison.
    
    Parameters:
    -----------
    conn_group1 : (n_subjects_1, n_nodes, n_nodes) array
    conn_group2 : (n_subjects_2, n_nodes, n_nodes) array
    threshold : t-statistic threshold for forming components
    n_permutations : number of permutations for null distribution
    """
    n1, n_nodes, _ = conn_group1.shape
    n2 = conn_group2.shape[0]
    
    # Step 1: Compute observed t-statistics
    from scipy import stats
    t_stat, p_values = stats.ttest_ind(
        conn_group1, conn_group2, axis=0
    )
    
    # Step 2: Find suprathreshold connections
    supra_threshold = np.abs(t_stat) > threshold
    
    # Step 3: Find connected components
    # (implementation requires graph algorithms)
    
    # Step 4: Compute component sizes
    # (sum of t-statistics in each component)
    
    # Step 5: Permutation testing
    null_distribution = []
    all_data = np.concatenate([conn_group1, conn_group2], axis=0)
    for perm in range(n_permutations):
        # Shuffle group labels
        indices = np.random.permutation(n1 + n2)
        perm_g1 = all_data[indices[:n1]]
        perm_g2 = all_data[indices[n1:]]
        
        t_perm, _ = stats.ttest_ind(perm_g1, perm_g2, axis=0)
        perm_supra = np.abs(t_perm) > threshold
        
        # Find max component size under null
        # ... (graph component analysis)
        null_distribution.append(max_component_size)
    
    # Step 6: Assign corrected p-values
    # p = proportion of null maxima >= observed component size
    
    return corrected_pvalues, component_assignments
```

### 4.5 Seed-Based Correlation Analysis

The simplest and most widely used rs-FC method:

```python
# Seed-based correlation analysis
def seed_based_connectivity(time_series_4d, seed_mask, brain_mask):
    """
    Compute seed-to-voxel correlation map.
    
    Parameters:
    -----------
    time_series_4d : 4D NIfTI (x, y, z, time)
    seed_mask : 3D binary mask for seed region
    brain_mask : 3D binary mask for brain voxels
    """
    from nilearn.masking import apply_mask
    from scipy.stats import pearsonr, zscore
    
    # Extract seed time series
    seed_ts = apply_mask(time_series_4d, seed_mask)
    seed_signal = np.mean(seed_ts, axis=1)  # Average across seed voxels
    
    # Extract all brain voxel time series
    brain_ts = apply_mask(time_series_4d, brain_mask)
    
    # Compute correlation with each voxel
    correlation_map = np.zeros(brain_ts.shape[1])
    for v in range(brain_ts.shape[1]):
        r, _ = pearsonr(seed_signal, brain_ts[:, v])
        correlation_map[v] = r
    
    # Fisher z-transform
    z_map = np.arctanh(np.clip(correlation_map, -0.999, 0.999))
    
    return correlation_map, z_map
```

### 4.6 Independent Component Analysis (ICA)

ICA decomposes the 4D fMRI signal into spatially independent components (networks):

```python
# Group ICA for network identification
from sklearn.decomposition import FastICA

def ica_network_decomposition(time_series_4d, n_components=20, brain_mask=None):
    """
    Perform ICA decomposition on fMRI data.
    
    Returns:
    --------
    components : (n_components, n_voxels) spatial maps
    time_courses : (n_timepoints, n_components) temporal dynamics
    """
    from nilearn.masking import apply_mask
    
    # Extract voxel time series
    data_2d = apply_mask(time_series_4d, brain_mask)  # (time, voxels)
    
    # Run ICA
    ica = FastICA(n_components=n_components, random_state=42)
    time_courses = ica.fit_transform(data_2d)  # (time, components)
    components = ica.components_  # (components, voxels)
    
    return components, time_courses
```

**Key ICA-derived networks** (similar to Yeo networks):
- Default Mode Network (DMN)
- Sensorimotor Network
- Visual Network
- Dorsal Attention Network
- Ventral Attention Network (Salience)
- Frontoparietal Control Network
- Language Network

### 4.7 Individual vs Group-Level Networks

| Aspect | Group-Level | Individual-Level |
|--------|-------------|------------------|
| **Subjects** | Averaged across cohort | Single subject |
| **Reliability** | High (stable across studies) | Moderate (depends on scan duration) |
| **Networks** | 7-17 canonical RSNs | Subject-specific variants |
| **Use case** | Atlas building, normative comparisons | Personalized neuromodulation |
| **Minutes of data** | 100s-1000s of subjects | 5-10 min minimum for stability |
| **DeepSynaps relevance** | Atlas-based network assignment | Not directly applicable (no patient MRI) |

---

## 5. Atlas Harmonization Strategies

### 5.1 The Cross-Atlas Mapping Problem

DeepSynaps needs to harmonize data from multiple atlases:
- **Allen Brain Atlas:** ~500 anatomical structures with gene expression data
- **Schaefer Parcellation:** 100-1000 functional parcels with network assignments
- **MNI Coordinate Space:** Patient-specific neuromodulation targets
- **AAL / Harvard-Oxford:** Additional anatomical references

These atlases differ in:
- Coordinate systems (MNI variants)
- Region definitions (anatomical vs functional)
- Resolution and granularity
- Coverage (cortex-only vs whole-brain)
- Data types (gene expression, connectivity, structure)

### 5.2 MNI152 as Lingua Franca

MNI152 is the standard spatial reference for cross-atlas integration:

```python
# MNI152 coordinate system parameters
MNI152_SPACE = {
    'template': 'ICBM 2009c Nonlinear Asymmetric',
    'voxel_size': [1, 1, 1],  # or 2mm
    'dimensions': [193, 229, 193],  # 1mm
    'origin': [96, 132, 77],  # voxel coordinates of AC-PC midpoint
    'orientation': 'RAS',  # Right-Anterior-Superior
}

# Allen Human Brain Atlas uses donor-specific MRI co-registration
# that is then transformed to MNI space for cross-reference
```

### 5.3 Coordinate-Based Mapping

The most robust harmonization strategy uses MNI coordinates:

```python
# ============================================================
# COORDINATE-BASED CROSS-ATLAS MAPPING
# ============================================================

def map_mni_to_schaefer_parcel(mni_coords, schaefer_atlas_path, labels):
    """
    Map MNI coordinates to Schaefer parcel.
    
    Parameters:
    -----------
    mni_coords : tuple (x, y, z) in mm
    schaefer_atlas_path : path to Schaefer NIfTI
    labels : list of Schaefer label strings
    
    Returns:
    --------
    parcel_info : dict with label, network, hemisphere
    """
    import nibabel as nib
    import numpy as np
    from scipy.spatial.distance import cdist
    
    atlas_img = nib.load(schaefer_atlas_path)
    atlas_data = atlas_img.get_fdata()
    affine = atlas_img.affine
    
    # Convert MNI to voxel coordinates
    mni_vector = np.array([mni_coords[0], mni_coords[1], mni_coords[2], 1])
    voxel_coords = np.linalg.solve(affine, mni_vector)[:3].astype(int)
    
    # Get parcel ID at coordinate
    parcel_id = int(atlas_data[voxel_coords[0], voxel_coords[1], voxel_coords[2]])
    
    if parcel_id == 0:
        # Outside any parcel -- find nearest
        parcel_indices = np.argwhere(atlas_data > 0)
        parcel_values = atlas_data[atlas_data > 0].astype(int)
        
        mni_coords_all = nib.affines.apply_affine(
            affine, parcel_indices
        )
        distances = cdist([mni_coords], mni_coords_all, metric='euclidean')[0]
        nearest_idx = np.argmin(distances)
        parcel_id = parcel_values[nearest_idx]
        distance_mm = distances[nearest_idx]
    else:
        distance_mm = 0.0
    
    label = labels[parcel_id - 1]  # 1-based indexing
    
    # Parse network and hemisphere from label
    parts = label.split('_')
    network_name = parts[2]
    hemisphere = parts[1]
    
    return {
        'parcel_id': parcel_id,
        'label': label,
        'network': network_name,
        'hemisphere': hemisphere,
        'mni_target': mni_coords,
        'distance_to_parcel_mm': distance_mm,
        'atlas_name': 'Schaefer2018'
    }


def map_mni_to_aba_structure(mni_coords, aba_structure_tree):
    """
    Map MNI coordinates to AHBA anatomical structure.
    Uses the structure tree with MRI coordinates from AHBA samples.
    
    Parameters:
    -----------
    mni_coords : (x, y, z) in mm
    aba_structure_tree : StructureTree object from AllenSDK
    
    Returns:
    --------
    structure_info : dict with structure details
    """
    # AHBA samples have MNI coordinates from donor MRI
    # We find the nearest sample point and return its structure
    
    # This requires pre-loaded AHBA sample data with coordinates
    # Query API for samples near the MNI coordinate
    
    # API query: find samples within a radius
    # GET .../query.json?criteria=model::Sample,
    # rma::criteria,mri[$gtx1$x$ltx2][...],
    # rma::include,structure
    
    pass  # Implementation requires AHBA data caching
```

### 5.4 Structure-to-Parcel Mapping

```python
def create_aba_to_schaefer_mapping(aba_structures, schaefer_labels, schaefer_centroids):
    """
    Create a lookup table mapping AHBA structures to Schaefer parcels.
    
    Strategy:
    1. For each AHBA structure, get representative MNI coordinate
    2. Find nearest Schaefer parcel centroid
    3. Build bidirectional mapping table
    """
    import pandas as pd
    from scipy.spatial.distance import cdist
    
    mappings = []
    
    for struct in aba_structures:
        struct_mni = struct.get('mni_coordinate')  # From AHBA sample data
        if struct_mni is None:
            continue
        
        # Find nearest Schaefer centroid
        distances = cdist([struct_mni], schaefer_centroids, metric='euclidean')[0]
        nearest_idx = np.argmin(distances)
        min_distance = distances[nearest_idx]
        
        schaefer_label = schaefer_labels[nearest_idx]
        network = schaefer_label.split('_')[2]
        
        mappings.append({
            'aba_structure_id': struct['id'],
            'aba_structure_name': struct['name'],
            'aba_acronym': struct['acronym'],
            'aba_mni': struct_mni,
            'schaefer_parcel_index': nearest_idx + 1,
            'schaefer_label': schaefer_label,
            'schaefer_network': network,
            'mapping_distance_mm': min_distance,
            'confidence': 'high' if min_distance < 5 else 
                         'medium' if min_distance < 10 else 'low'
        })
    
    return pd.DataFrame(mappings)
```

### 5.5 Multi-Atlas Fusion

```python
# ============================================================
# MULTI-ATLAS REGION QUERY ENGINE
# ============================================================

class MultiAtlasRegionResolver:
    """
    Unified query engine that resolves a brain region across all
    available atlases and returns enriched context.
    """
    
    def __init__(self):
        self.schaefer_atlases = {}  # Cache for different resolutions
        self.aba_structure_tree = None
        self.aal_atlas = None
        self.harvard_oxford_atlas = None
    
    def resolve_mni_coordinate(self, x, y, z, resolution=400):
        """
        Resolve an MNI coordinate across all atlases.
        
        Returns a RegionContext object with:
        - Schaefer parcel assignment (network, hemisphere)
        - Allen Brain Atlas structure (with gene expression availability)
        - Anatomical label from Harvard-Oxford
        - Functional network context
        - Confidence scores for each mapping
        """
        result = {
            'input_mni': (x, y, z),
            'query_timestamp': datetime.now().isoformat(),
            'atlas_results': {},
            'governance_flags': {
                'research_context_only': True,
                'population_average': True,
                'not_patient_specific': True
            }
        }
        
        # 1. Schaefer assignment
        schaefer = self._load_schaefer(resolution)
        schaefer_info = map_mni_to_schaefer_parcel(
            (x, y, z), schaefer.maps, schaefer.labels
        )
        result['atlas_results']['schaefer'] = schaefer_info
        
        # 2. ABA structure mapping
        aba_info = self._map_to_aba_structure((x, y, z))
        result['atlas_results']['allen_brain_atlas'] = aba_info
        
        # 3. Harvard-Oxford anatomical label
        ho_info = self._map_to_harvard_oxford((x, y, z))
        result['atlas_results']['harvard_oxford'] = ho_info
        
        # 4. Cross-atlas consistency check
        result['consistency_score'] = self._compute_consistency(result)
        
        # 5. Add DeepSynaps display context
        result['display_context'] = self._generate_display_context(result)
        
        return result
    
    def _generate_display_context(self, result):
        """Generate clinical display context with all caveats."""
        schaefer = result['atlas_results'].get('schaefer', {})
        aba = result['atlas_results'].get('allen_brain_atlas', {})
        
        return {
            'primary_label': schaefer.get('label', 'Unknown'),
            'network_assignment': schaefer.get('network', 'Unknown'),
            'network_display_text': (
                f"{schaefer.get('network', '?')} network "
                f"(group-level functional topology, not patient assessment)"
            ),
            'anatomical_context': aba.get('structure_name', 'Unknown'),
            'gene_expression_available': aba.get('has_expression_data', False),
            'expression_display_text': (
                "Gene expression data available (population average, ~6 donors, "
                "post-mortem microarray -- contextual enrichment only)"
                if aba.get('has_expression_data') 
                else "No direct gene expression data for this coordinate"
            ),
            'confidence_level': self._aggregate_confidence(result),
            'caveat_banners': [
                "Atlas data is population-averaged research context, not patient-specific",
                "Network labels reflect group-level functional topology",
                "Gene expression data comes from ~6 post-mortem adult donors",
                "Not for clinical diagnosis -- enrichment context only"
            ]
        }
```

### 5.6 Resolution Selection Guide

| Clinical Scenario | Recommended Resolution | Rationale |
|-------------------|----------------------|-----------|
| High-level network context | 100 parcels | Clear network boundaries, minimal complexity |
| Target-region analysis | 200 parcels | Balanced detail and interpretability |
| Protocol planning | 400 parcels | Standard research resolution |
| Detailed parcel analysis | 600-1000 parcels | Maximum cortical granularity |
| TMS target mapping | 200-400 parcels | Matches TMS spatial resolution (~5mm) |
| tDCS montage design | 100 parcels | Matches tDCS field spread |

---

## 6. DeepSynaps Integration Architecture

### 6.1 System Architecture Overview

```
+------------------------------------------------------------------+
|                    DeepSynaps Protocol Studio                      |
|                         (Frontend / UI)                           |
+------------------------------------------------------------------+
                              |
+-----------------------------v------------------------------------+
|                   Atlas Integration Layer (API)                   |
|                                                                   |
|  +-------------------+  +-------------------+  +--------------+  |
|  | ABA API Adapter   |  | Schaefer Adapter  |  | MNI Adapter  |  |
|  | (Gene Expression) |  | (Network Maps)    |  | (Coordinates)|  |
|  +-------------------+  +-------------------+  +--------------+  |
|           |                      |                     |          |
|           v                      v                     v          |
|  +-------------------+  +-------------------+  +--------------+  |
|  | ABA Cache Layer   |  | Schaefer Cache    |  | Atlas LUT    |  |
|  | (Gene/Structure)  |  | (Parcel/Network)  |  | (Mappings)   |  |
|  +-------------------+  +-------------------+  +--------------+  |
|                              |                                    |
+------------------------------v------------------------------------+
|                   Harmonization Engine                             |
|         (Cross-atlas mapping, confidence scoring)                  |
+------------------------------------------------------------------+
                              |
+-----------------------------v------------------------------------+
|                   DeepTwin Enrichment Service                      |
|   (Region biology + network context + clinical neuromodulation)    |
+------------------------------------------------------------------+
                              |
+-----------------------------v------------------------------------+
|                   Display Rules Engine                             |
|        (Governance flags, caveat injection, confidence UI)         |
+------------------------------------------------------------------+
```

### 6.2 Allen Brain Atlas Adapter

```python
# ============================================================
# ALLEN BRAIN ATLAS API ADAPTER
# ============================================================

import requests
import json
import pandas as pd
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from datetime import datetime
import hashlib

@dataclass
class ABAQueryResult:
    """Structured result from ABA API query."""
    query_type: str
    parameters: Dict[str, Any]
    raw_response: dict
    parsed_data: pd.DataFrame
    query_timestamp: str
    cache_key: str
    provenance: Dict[str, str]


class AllenBrainAtlasAdapter:
    """
    DeepSynaps adapter for the Allen Brain Atlas API.
    
    Handles:
    - Gene expression queries by structure
    - Structure ontology navigation
    - Differential and correlative searches
    - Response caching for performance
    - Provenance tracking for all data
    
    All data is tagged with research-context governance flags.
    """
    
    API_BASE = "http://api.brain-map.org"
    RMA_ENDPOINT = f"{API_BASE}/api/v2/data"
    
    def __init__(self, cache_dir: str = "/tmp/aba_cache"):
        self.cache_dir = cache_dir
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'DeepSynaps-Protocol-Studio/2.0 (Research Context)',
            'Accept': 'application/json'
        })
        self._structure_cache = {}
        self._gene_cache = {}
    
    # ---- Core RMA Query Engine ----
    
    def _rma_query(self, criteria: str, include: str = "", 
                   options: str = "", fmt: str = "json") -> dict:
        """Execute RMA query against Allen Brain Atlas API."""
        url = f"{self.RMA_ENDPOINT}/query.{fmt}"
        params = {"criteria": criteria}
        if include:
            params["include"] = include
        if options:
            params["rma::options"] = options
        
        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
    
    # ---- Structure Queries ----
    
    def query_structure_by_name(self, name: str) -> ABAQueryResult:
        """Query structures by name (case-insensitive)."""
        criteria = (
            f"model::Structure,"
            f"rma::criteria,[name$il'{name}'],"
            f"ontology[name$eq'Human Brain Atlas']"
        )
        result = self._rma_query(criteria)
        
        df = pd.DataFrame()
        if result.get("success") and "msg" in result:
            structures = result["msg"]
            df = pd.DataFrame(structures)
        
        return ABAQueryResult(
            query_type="structure_by_name",
            parameters={"name": name},
            raw_response=result,
            parsed_data=df,
            query_timestamp=datetime.now().isoformat(),
            cache_key=hashlib.md5(name.encode()).hexdigest(),
            provenance={
                "source": "Allen Human Brain Atlas",
                "api_version": "v2",
                "data_type": "structure_ontology",
                "license": "CC BY 4.0",
                "context": "research_only"
            }
        )
    
    def query_structure_tree(self, root_id: int = 4005) -> pd.DataFrame:
        """Download full structure ontology tree."""
        url = f"{self.API_BASE}/api/v2/structure_graph_download/{root_id}.json"
        response = self.session.get(url, timeout=30)
        data = response.json()
        
        # Flatten tree into DataFrame
        records = []
        def traverse(node, depth=0):
            records.append({
                'id': node['id'],
                'name': node['name'],
                'acronym': node.get('acronym', ''),
                'parent_id': node.get('parent_structure_id'),
                'depth': depth,
                'graph_order': node.get('graph_order', 0),
                'color': node.get('color_hex_triplet', '')
            })
            for child in node.get('children', []):
                traverse(child, depth + 1)
        
        traverse(data)
        df = pd.DataFrame(records)
        self._structure_cache = {row['id']: row for _, row in df.iterrows()}
        return df
    
    # ---- Gene Expression Queries ----
    
    def query_gene_expression(self, gene_symbol: str, 
                              structure_ids: Optional[List[int]] = None,
                              donor_ids: Optional[List[int]] = None) -> ABAQueryResult:
        """
        Query gene expression values for a specific gene.
        
        Returns expression levels and z-scores across donors and structures.
        """
        # Step 1: Find probe IDs for gene
        probe_criteria = (
            f"model::Probe,"
            f"rma::criteria,[probe_type$eq'DNA'],"
            f"products[abbreviation$eq'HumanMA'],"
            f"gene[acronym$eq'{gene_symbol}']"
        )
        probe_result = self._rma_query(probe_criteria)
        
        if not probe_result.get("msg"):
            return ABAQueryResult(
                query_type="gene_expression",
                parameters={"gene": gene_symbol},
                raw_response=probe_result,
                parsed_data=pd.DataFrame(),
                query_timestamp=datetime.now().isoformat(),
                cache_key="",
                provenance={"error": "No probes found for gene"}
            )
        
        probe_ids = [p['id'] for p in probe_result['msg']]
        
        # Step 2: Query expression values
        expr_criteria = (
            f"service::human_microarray_expression"
            f"[probes$eq{','.join(map(str, probe_ids))}]"
        )
        if donor_ids:
            expr_criteria += f"[donors$eq{','.join(map(str, donor_ids))}]"
        if structure_ids:
            expr_criteria += f"[structures$eq{','.join(map(str, structure_ids))}]"
        
        expr_result = self._rma_query(expr_criteria)
        
        # Step 3: Parse into DataFrame
        df = self._parse_expression_response(expr_result, gene_symbol)
        
        return ABAQueryResult(
            query_type="gene_expression",
            parameters={"gene": gene_symbol, 
                       "structures": structure_ids,
                       "donors": donor_ids},
            raw_response=expr_result,
            parsed_data=df,
            query_timestamp=datetime.now().isoformat(),
            cache_key=hashlib.md5(f"{gene_symbol}{structure_ids}".encode()).hexdigest(),
            provenance={
                "source": "Allen Human Brain Atlas",
                "assay": "microarray",
                "n_donors": 6,
                "data_type": "expression_level + z-score",
                "license": "CC BY 4.0",
                "context": "research_only_population_average"
            }
        )
    
    def _parse_expression_response(self, response: dict, 
                                    gene_symbol: str) -> pd.DataFrame:
        """Parse expression API response into structured DataFrame."""
        records = []
        if not response.get("msg"):
            return pd.DataFrame()
        
        msg = response["msg"]
        probes = msg.get("probes", [])
        samples = msg.get("samples", [])
        
        for probe in probes:
            for i, sample in enumerate(samples):
                records.append({
                    'gene_symbol': gene_symbol,
                    'probe_id': probe['id'],
                    'probe_name': probe['name'],
                    'entrez_id': probe.get('entrez-id'),
                    'donor_id': sample['donor']['id'],
                    'donor_name': sample['donor']['name'],
                    'donor_age': sample['donor']['age'],
                    'structure_id': sample['structure']['id'],
                    'structure_name': sample['structure']['name'],
                    'structure_acronym': sample['structure']['abbreviation'],
                    'mni_coordinate': sample['sample'].get('mri'),
                    'expression_level': float(probe['expression_level'][i]),
                    'z_score': float(probe['z-score'][i])
                })
        
        return pd.DataFrame(records)
    
    # ---- Differential Search ----
    
    def differential_search(self, target_structures: List[int],
                           contrast_structures: List[int],
                           sort_by: str = "fold-change") -> ABAQueryResult:
        """
        Find genes differentially expressed between two sets of structures.
        Uses 2-sample t-test with Benjamini-Hochberg FDR correction.
        """
        criteria = (
            f"service::human_microarray_differential"
            f"[structures1$eq{','.join(map(str, contrast_structures))}]"
            f"[structures2$eq{','.join(map(str, target_structures))}]"
            f"[sort_by$eq'{sort_by}']"
        )
        result = self._rma_query(criteria)
        
        return ABAQueryResult(
            query_type="differential_search",
            parameters={"target": target_structures, 
                       "contrast": contrast_structures},
            raw_response=result,
            parsed_data=pd.DataFrame(result.get("msg", [])),
            query_timestamp=datetime.now().isoformat(),
            cache_key="",
            provenance={
                "statistical_method": "two_sample_ttest_bh_fdr",
                "context": "research_only"
            }
        )
    
    # ---- Correlative Search ----
    
    def correlative_search(self, seed_gene_symbol: str,
                          structure_id: int = 4005) -> ABAQueryResult:
        """
        Find genes with expression profiles correlated to seed gene.
        Uses Pearson correlation across all samples in specified structure.
        """
        # Find seed probe
        probe_criteria = (
            f"model::Probe,"
            f"rma::criteria,[probe_type$eq'DNA'],"
            f"products[abbreviation$eq'HumanMA'],"
            f"gene[acronym$eq'{seed_gene_symbol}']"
        )
        probe_result = self._rma_query(probe_criteria)
        
        if not probe_result.get("msg"):
            return ABAQueryResult(
                query_type="correlative_search",
                parameters={"seed_gene": seed_gene_symbol},
                raw_response=probe_result,
                parsed_data=pd.DataFrame(),
                query_timestamp=datetime.now().isoformat(),
                cache_key="",
                provenance={"error": "No seed probe found"}
            )
        
        seed_probe_id = probe_result['msg'][0]['id']
        
        criteria = (
            f"service::human_microarray_correlation"
            f"[probes$eq{seed_probe_id}]"
            f"[structures$eq{structure_id}]"
        )
        result = self._rma_query(criteria)
        
        return ABAQueryResult(
            query_type="correlative_search",
            parameters={"seed_gene": seed_gene_symbol},
            raw_response=result,
            parsed_data=pd.DataFrame(result.get("msg", [])),
            query_timestamp=datetime.now().isoformat(),
            cache_key="",
            provenance={
                "statistical_method": "pearson_correlation",
                "context": "research_only"
            }
        )
    
    # ---- Batch Expression Queries ----
    
    def query_multiple_genes(self, gene_symbols: List[str],
                             structure_id: int) -> pd.DataFrame:
        """
        Query expression for multiple genes in a single structure.
        Combines individual queries into a unified DataFrame.
        """
        all_results = []
        for gene in gene_symbols:
            result = self.query_gene_expression(gene, structure_ids=[structure_id])
            if not result.parsed_data.empty:
                all_results.append(result.parsed_data)
        
        if all_results:
            return pd.concat(all_results, ignore_index=True)
        return pd.DataFrame()
```

### 6.3 Schaefer Adapter

```python
# ============================================================
# SCHAEFER ATLAS ADAPTER
# ============================================================

from nilearn.datasets import fetch_atlas_schaefer_2018
import nibabel as nib
import numpy as np
import pandas as pd
from pathlib import Path


class SchaeferAtlasAdapter:
    """
    DeepSynaps adapter for the Schaefer 2018 parcellation.
    
    Provides:
    - Atlas loading at multiple resolutions (100-1000)
    - Network assignment queries
    - MNI-to-parcel mapping
    - Parcel metadata (label, network, hemisphere, centroid)
    - Network-level aggregation
    
    All network assignments carry governance flags indicating
    they are group-level functional topology labels.
    """
    
    SUPPORTED_RESOLUTIONS = [100, 200, 300, 400, 500, 600, 800, 1000]
    SUPPORTED_NETWORKS = [7, 17]
    SUPPORTED_MM = [1, 2]
    
    # Network name mappings
    YEO_7_NETWORKS = {
        1: 'Vis', 2: 'SomMot', 3: 'DorsAttn', 
        4: 'VentAttn', 5: 'Limbic', 6: 'FrontPar', 7: 'Default'
    }
    
    def __init__(self, data_dir: str = None):
        self.data_dir = data_dir
        self._atlas_cache = {}  # (n_rois, yeo_networks, mm) -> atlas
    
    def load_atlas(self, n_rois: int = 400, yeo_networks: int = 7,
                   resolution_mm: int = 1):
        """
        Load Schaefer atlas with specified parameters.
        
        Parameters:
        -----------
        n_rois : int -- Number of parcels (100-1000)
        yeo_networks : int -- 7 or 17 network solution
        resolution_mm : int -- 1 or 2 mm spatial resolution
        
        Returns:
        --------
        atlas_bunch : nilearn Bunch with maps, labels, description
        """
        cache_key = (n_rois, yeo_networks, resolution_mm)
        if cache_key in self._atlas_cache:
            return self._atlas_cache[cache_key]
        
        if n_rois not in self.SUPPORTED_RESOLUTIONS:
            raise ValueError(f"n_rois must be in {self.SUPPORTED_RESOLUTIONS}")
        if yeo_networks not in self.SUPPORTED_NETWORKS:
            raise ValueError(f"yeo_networks must be in {self.SUPPORTED_NETWORKS}")
        if resolution_mm not in self.SUPPORTED_MM:
            raise ValueError(f"resolution_mm must be in {self.SUPPORTED_MM}")
        
        atlas = fetch_atlas_schaefer_2018(
            n_rois=n_rois,
            yeo_networks=yeo_networks,
            resolution_mm=resolution_mm,
            data_dir=self.data_dir
        )
        
        self._atlas_cache[cache_key] = atlas
        return atlas
    
    def get_parcel_metadata(self, n_rois: int = 400, 
                            yeo_networks: int = 7) -> pd.DataFrame:
        """
        Get structured metadata for all parcels as DataFrame.
        
        Returns DataFrame with columns:
        - parcel_index (1-based)
        - full_label
        - network_name
        - network_index
        - hemisphere
        - parcel_number_within_network
        """
        atlas = self.load_atlas(n_rois, yeo_networks)
        
        records = []
        for idx, label in enumerate(atlas.labels):
            parts = label.split('_')
            # Format: 7Networks_LH_Vis_1 or 17Networks_LH_VisCent_1
            network_version = parts[0]
            hemi = parts[1]
            network_name = parts[2]
            parcel_num = '_'.join(parts[3:]) if len(parts) > 3 else '0'
            
            # Derive network index from label ordering
            network_index = self._get_network_index(network_name, yeo_networks)
            
            records.append({
                'parcel_index': idx + 1,
                'full_label': label,
                'network_version': network_version,
                'hemisphere': hemi,
                'network_name': network_name,
                'network_index': network_index,
                'parcel_subnum': parcel_num
            })
        
        df = pd.DataFrame(records)
        
        # Compute MNI centroids
        centroids = self._compute_parcel_centroids(n_rois, yeo_networks)
        df['mni_x'] = centroids[:, 0]
        df['mni_y'] = centroids[:, 1]
        df['mni_z'] = centroids[:, 2]
        
        return df
    
    def _get_network_index(self, network_name: str, yeo_networks: int) -> int:
        """Map network name to canonical index."""
        if yeo_networks == 7:
            name_map = {
                'Vis': 1, 'SomMot': 2, 'DorsAttn': 3,
                'VentAttn': 4, 'Limbic': 5, 'FrontPar': 6, 'Default': 7
            }
        else:
            name_map = {
                'VisCent': 1, 'VisPeri': 2, 'SomMotA': 3, 'SomMotB': 4,
                'DorsAttnA': 5, 'DorsAttnB': 6, 'SalVentAttnA': 7,
                'SalVentAttnB': 8, 'LimbicA': 9, 'LimbicB': 10,
                'ContA': 11, 'ContB': 12, 'ContC': 13,
                'DefaultA': 14, 'DefaultB': 15, 'DefaultC': 16, 'TempPar': 17
            }
        return name_map.get(network_name, 0)
    
    def _compute_parcel_centroids(self, n_rois: int, yeo_networks: int) -> np.ndarray:
        """Compute MNI centroid for each parcel."""
        from scipy import ndimage
        
        atlas = self.load_atlas(n_rois, yeo_networks)
        atlas_img = nib.load(atlas.maps)
        data = atlas_img.get_fdata()
        affine = atlas_img.affine
        
        centroids = np.full((n_rois, 3), np.nan)
        for roi_idx in range(1, n_rois + 1):
            mask = data == roi_idx
            if mask.sum() > 0:
                com_voxel = ndimage.center_of_mass(mask)
                com_mni = nib.affines.apply_affine(affine, com_voxel)
                centroids[roi_idx - 1] = com_mni
        return centroids
    
    def find_parcel_by_mni(self, x: float, y: float, z: float,
                           n_rois: int = 400, yeo_networks: int = 7,
                           search_radius_mm: float = 0) -> dict:
        """
        Find which Schaefer parcel contains (or is nearest to) the MNI coordinate.
        
        Parameters:
        -----------
        x, y, z : MNI coordinates in mm
        search_radius_mm : If > 0 and coordinate not in any parcel,
                          search within this radius for nearest parcel
        
        Returns:
        --------
        dict with parcel info, or empty dict if not found
        """
        atlas = self.load_atlas(n_rois, yeo_networks)
        atlas_img = nib.load(atlas.maps)
        data = atlas_img.get_fdata()
        affine = atlas_img.affine
        
        # Convert MNI to voxel
        mni_vec = np.array([x, y, z, 1])
        voxel = np.linalg.solve(affine, mni_vec)[:3]
        vx, vy, vz = [int(round(v)) for v in voxel]
        
        # Check bounds
        if (0 <= vx < data.shape[0] and 
            0 <= vy < data.shape[1] and 
            0 <= vz < data.shape[2]):
            parcel_id = int(data[vx, vy, vz])
        else:
            parcel_id = 0
        
        distance_mm = 0.0
        
        if parcel_id == 0 and search_radius_mm > 0:
            # Find nearest parcel within radius
            meta = self.get_parcel_metadata(n_rois, yeo_networks)
            coords = meta[['mni_x', 'mni_y', 'mni_z']].values
            target = np.array([[x, y, z]])
            distances = np.linalg.norm(coords - target, axis=1)
            nearest_idx = np.argmin(distances)
            min_dist = distances[nearest_idx]
            
            if min_dist <= search_radius_mm:
                parcel_id = nearest_idx + 1
                distance_mm = min_dist
            else:
                return {'found': False, 'reason': 'outside_search_radius'}
        
        if parcel_id == 0:
            return {'found': False, 'reason': 'outside_all_parcels'}
        
        label = atlas.labels[parcel_id - 1]
        parts = label.split('_')
        
        return {
            'found': True,
            'parcel_id': parcel_id,
            'label': label,
            'network_name': parts[2],
            'hemisphere': parts[1],
            'mni_coordinate': (x, y, z),
            'distance_to_centroid_mm': distance_mm,
            'n_rois': n_rois,
            'yeo_networks': yeo_networks,
            'atlas_version': 'Schaefer2018',
            'governance_flag': 'group_level_functional_topology'
        }
    
    def get_network_parcels(self, network_name: str, 
                            n_rois: int = 400, yeo_networks: int = 7) -> pd.DataFrame:
        """Get all parcels belonging to a specific network."""
        meta = self.get_parcel_metadata(n_rois, yeo_networks)
        return meta[meta['network_name'] == network_name]
    
    def get_network_summary(self, n_rois: int = 400, 
                           yeo_networks: int = 7) -> pd.DataFrame:
        """Get summary statistics per network."""
        meta = self.get_parcel_metadata(n_rois, yeo_networks)
        return meta.groupby('network_name').agg(
            n_parcels=('parcel_index', 'count'),
            avg_mni_x=('mni_x', 'mean'),
            avg_mni_y=('mni_y', 'mean'),
            avg_mni_z=('mni_z', 'mean')
        ).reset_index()
```

### 6.4 Gene Expression Context Service

```python
# ============================================================
# GENE EXPRESSION CONTEXT SERVICE
# ============================================================

class GeneExpressionContextService:
    """
    Provides gene expression context for neuromodulation targets.
    
    Given an MNI coordinate and a list of genes of interest,
    queries the Allen Brain Atlas and returns expression data
    with appropriate clinical context and caveats.
    """
    
    NEUROMODULATION_GENE_PANELS = {
        'depression_tms': ['BDNF', 'SLC6A4', 'HTR1A', 'HTR2A', 'DRD2', 
                           'COMT', 'CREB1', 'GRIA1'],
        'depression_tdcs': ['BDNF', 'GAD1', 'GAD2', 'GLUA1', 'NMDAR1'],
        'motor_pd': ['DRD1', 'DRD2', 'DAT', 'COMT', 'GAD1', 'GAD2'],
        'pain': ['OPRM1', 'OPRD1', 'TRPV1', 'SCN9A', 'GRIA1'],
        'ocd': ['HTR2A', 'SLC6A4', 'DRD2', 'GRIN1', 'GAD1'],
        'epilepsy': ['SCN1A', 'KCNQ1', 'GABRA1', 'GAD1', 'GRIN1'],
        'default': ['BDNF', 'DRD2', 'SLC6A4', 'HTR1A', 'GAD1', 
                    'GRIN1', 'GRIA1', 'COMT']
    }
    
    def __init__(self, aba_adapter: AllenBrainAtlasAdapter):
        self.aba = aba_adapter
    
    def get_expression_context(self, mni_coords: tuple,
                                indication: str = 'default',
                                gene_symbols: List[str] = None) -> dict:
        """
        Get gene expression context for a neuromodulation target.
        
        Parameters:
        -----------
        mni_coords : (x, y, z) in MNI mm
        indication : clinical indication for gene panel selection
        gene_symbols : override with specific genes
        
        Returns:
        --------
        ExpressionContext with governance flags and display text
        """
        x, y, z = mni_coords
        
        # Select gene panel
        if gene_symbols is None:
            gene_symbols = self.NEUROMODULATION_GENE_PANELS.get(
                indication, self.NEUROMODULATION_GENE_PANELS['default']
            )
        
        # Map coordinate to nearest AHBA structure
        # (This requires pre-loaded structure tree with sample coordinates)
        nearest_structure = self._find_nearest_aba_structure(mni_coords)
        
        # Query expression for each gene
        expression_results = []
        for gene in gene_symbols:
            result = self.aba.query_gene_expression(
                gene, structure_ids=[nearest_structure['id']]
            )
            if not result.parsed_data.empty:
                # Aggregate across donors and probes
                agg = result.parsed_data.groupby('gene_symbol').agg(
                    mean_expression=('expression_level', 'mean'),
                    std_expression=('expression_level', 'std'),
                    mean_zscore=('z_score', 'mean'),
                    n_donors=('donor_id', 'nunique'),
                    n_probes=('probe_id', 'nunique')
                ).reset_index()
                expression_results.append(agg)
        
        if expression_results:
            expression_df = pd.concat(expression_results, ignore_index=True)
            expression_df = expression_df.sort_values('mean_zscore', ascending=False)
        else:
            expression_df = pd.DataFrame()
        
        return {
            'mni_coordinate': mni_coords,
            'nearest_aba_structure': nearest_structure,
            'indication': indication,
            'genes_queried': gene_symbols,
            'expression_data': expression_df.to_dict('records') if not expression_df.empty else [],
            'display_context': self._format_expression_display(expression_df),
            'governance': {
                'data_source': 'Allen Human Brain Atlas',
                'n_donors': 6,
                'assay': 'microarray',
                'data_type': 'population_average_postmortem',
                'clinical_status': 'RESEARCH_CONTEXT_ONLY',
                'disclaimer': (
                    'Gene expression data provides molecular context only. '
                    'It is not a clinical biomarker and cannot diagnose, '
                    'predict treatment response, or guide patient-specific '
                    'neuromodulation parameters.'
                )
            }
        }
    
    def _format_expression_display(self, df: pd.DataFrame) -> dict:
        """Format expression data for clinical display."""
        if df.empty:
            return {'has_data': False, 'top_genes': []}
        
        top_genes = []
        for _, row in df.head(5).iterrows():
            z = row['mean_zscore']
            level = 'high' if z > 1.5 else 'moderate' if z > 0.5 else 'low'
            top_genes.append({
                'gene': row['gene_symbol'],
                'expression_level': level,
                'z_score': round(z, 2),
                'n_donors_measured': int(row['n_donors']),
                'display_text': (
                    f"{row['gene_symbol']}: {level} expression "
                    f"(z={z:.2f}, n={int(row['n_donors'])} donors)"
                )
            })
        
        return {
            'has_data': True,
            'n_genes_with_data': len(df),
            'top_genes': top_genes,
            'panel_summary': (
                f"Expression data available for {len(df)} of "
                f"{len(df)} queried genes from 6 post-mortem donors"
            )
        }
    
    def _find_nearest_aba_structure(self, mni_coords: tuple) -> dict:
        """Find nearest AHBA structure to MNI coordinate."""
        # This is a simplified version -- in production,
        # use the AHBA sample coordinates from API
        x, y, z = mni_coords
        
        # Simplified region lookup based on MNI coordinates
        # Full implementation requires AHBA sample data with coordinates
        structures = self.aba.query_structure_tree()
        
        # Return placeholder -- production uses actual sample coordinates
        return {
            'id': None,
            'name': 'Requires AHBA coordinate mapping',
            'acronym': 'N/A',
            'governance': 'coordinate_mapping_required'
        }
```



---

## 7. Display Rules & Caveats

### 7.1 Mandatory Display Rules

Every piece of atlas-derived data displayed in DeepSynaps MUST adhere to the following display rules:

#### 7.1.1 Gene Expression Data

| Rule | Requirement | Severity |
|------|-------------|----------|
| **Header label** | Must display "Contextual Molecular Enrichment" | CRITICAL |
| **Sub-header** | Must display "Research Context -- Not Clinical Evidence" | CRITICAL |
| **Donor count** | Must show "~6 adult post-mortem donors" | CRITICAL |
| **Assay type** | Must show "Microarray / RNA-Seq" | REQUIRED |
| **Data type** | Must show "Population average, not patient-specific" | CRITICAL |
| **Interpretation guidance** | Must show "Provides molecular context; not a biomarker" | REQUIRED |
| **Clinical disclaimer** | Must show "Not for diagnosis, prognosis, or treatment guidance" | CRITICAL |
| **Source citation** | Must show "Allen Human Brain Atlas (CC BY 4.0)" | REQUIRED |

#### 7.1.2 Network Labels

| Rule | Requirement | Severity |
|------|-------------|----------|
| **Header label** | Must display "Functional Network Topology" | CRITICAL |
| **Sub-header** | Must display "Group-Level Anatomical Organization" | CRITICAL |
| **Network count** | Must reference "Based on ~1,500-subject rs-fMRI (Yeo 2011)" | REQUIRED |
| **Data type** | Must show "Group-average functional connectivity, not patient assessment" | CRITICAL |
| **Clinical disclaimer** | Must show "Network labels reflect population-level organization" | REQUIRED |
| **Source citation** | Must show "Schaefer 2018 / Yeo 2011 (CC BY 4.0)" | REQUIRED |

#### 7.1.3 Atlas Coordinates

| Rule | Requirement | Severity |
|------|-------------|----------|
| **Coordinate system** | Must display "MNI152 Space" | REQUIRED |
| **Precision note** | Must show "Population template, not patient-specific MRI" | REQUIRED |
| **Cross-atlas note** | Must show "Cross-atlas mapping approximate (typical error 2-10mm)" | REQUIRED |
| **Confidence level** | Must display confidence score (High/Medium/Low) | REQUIRED |

### 7.2 Display Banner Templates

```html
<!-- Gene Expression Context Banner -->
<div class="ds-banner ds-banner--molecular">
  <div class="ds-banner__icon">&#x1F52C;</div>
  <div class="ds-banner__content">
    <div class="ds-banner__title">Contextual Molecular Enrichment</div>
    <div class="ds-banner__subtitle">Research Context Only -- Not Clinical Evidence</div>
    <div class="ds-banner__details">
      Source: Allen Human Brain Atlas (microarray, ~6 donors, post-mortem) |
      License: CC BY 4.0 |
      This data provides molecular context only and is not a clinical biomarker.
      Not for diagnosis, prognosis, or treatment guidance.
    </div>
  </div>
</div>

<!-- Network Topology Banner -->
<div class="ds-banner ds-banner--network">
  <div class="ds-banner__icon">&#x1F9E0;</div>
  <div class="ds-banner__content">
    <div class="ds-banner__title">Functional Network Topology</div>
    <div class="ds-banner__subtitle">Group-Level Anatomical Organization</div>
    <div class="ds-banner__details">
      Source: Schaefer 2018 parcellation based on Yeo 2011 networks |
      Derived from resting-state fMRI of ~1,500 subjects |
      License: CC BY 4.0 |
      Network labels reflect population-level functional organization,
      not patient-specific functional status.
    </div>
  </div>
</div>

<!-- General Atlas Data Banner -->
<div class="ds-banner ds-banner--atlas">
  <div class="ds-banner__icon">&#x1F5FA;</div>
  <div class="ds-banner__content">
    <div class="ds-banner__title">Atlas-Based Context</div>
    <div class="ds-banner__subtitle">Population Average -- Not Patient-Specific</div>
    <div class="ds-banner__details">
      All atlas-derived data represents population averages from research cohorts.
      Cross-atlas mapping involves inherent spatial uncertainty (2-10mm typical).
      This enrichment is for informational context only.
    </div>
  </div>
</div>
```

### 7.3 Confidence Scoring Display

```python
# Confidence score display
CONFIDENCE_DISPLAY = {
    'HIGH': {
        'color': '#4CAF50',
        'icon': '&#x2714;',
        'text': 'High Confidence',
        'description': 'Direct mapping with <5mm spatial error'
    },
    'MEDIUM': {
        'color': '#FF9800',
        'icon': '&#x26A0;',
        'text': 'Medium Confidence',
        'description': 'Nearest-match mapping with 5-10mm spatial error'
    },
    'LOW': {
        'color': '#F44336',
        'icon': '&#x2718;',
        'text': 'Low Confidence',
        'description': 'Approximate mapping with >10mm spatial error'
    },
    'INDIRECT': {
        'color': '#9E9E9E',
        'icon': '&#x2194;',
        'text': 'Indirect Mapping',
        'description': 'Mapped via intermediate atlas or hierarchy'
    }
}
```

### 7.4 Hover/Tooltip Content Templates

```python
# Tooltip content generators
def gene_expression_tooltip(gene_symbol: str, z_score: float, 
                            n_donors: int, structure_name: str) -> str:
    """Generate tooltip text for gene expression display."""
    level = 'high' if z_score > 1.5 else 'moderate' if z_score > 0.5 else 'low'
    return (
        f"{gene_symbol}: {level} expression in {structure_name}\n"
        f"Z-score: {z_score:.2f} (relative to all brain regions)\n"
        f"Measured in {n_donors}/6 post-mortem adult donors\n"
        f"Assay: Agilent microarray\n"
        f"Source: Allen Human Brain Atlas\n"
        "\nNote: This is contextual enrichment only, "
        "not a clinical biomarker."
    )

def network_assignment_tooltip(parcel_label: str, network_name: str,
                                n_subjects: int = 1489) -> str:
    """Generate tooltip text for network assignment display."""
    return (
        f"Parcel: {parcel_label}\n"
        f"Network: {network_name}\n"
        f"Assignment: Based on Yeo 2011 {n_subjects}-subject rs-fMRI\n"
        f"Source: Schaefer 2018 parcellation\n"
        "\nNote: This is a group-level functional topology label, "
        "not an assessment of this patient's functional status."
    )
```

### 7.5 Export/Report Caveat Injection

```python
# Automatic caveat injection for exported reports
def inject_caveat_footer(data_type: str) -> str:
    """Generate footer caveat text for exported documents."""
    caveats = {
        'gene_expression': (
            "---\n"
            "DATA GOVERNANCE NOTICE:\n"
            "The gene expression data presented above is sourced from the "
            "Allen Human Brain Atlas (CC BY 4.0), a research dataset "
            "comprising ~6 adult post-mortem human brains. This data "
            "provides population-averaged molecular context only and "
            "is NOT a clinical biomarker. It should not be used for "
            "diagnosis, prognosis, or patient-specific treatment guidance.\n"
            "Classification: Research Context Only\n"
            "Confidence: Population Average (not patient-specific)"
        ),
        'network_topology': (
            "---\n"
            "DATA GOVERNANCE NOTICE:\n"
            "The network assignments presented above are derived from "
            "the Schaefer 2018 parcellation (CC BY 4.0), based on "
            "resting-state fMRI from ~1,500 subjects. These labels "
            "reflect group-level functional network organization and "
            "are NOT patient-specific functional assessments.\n"
            "Classification: Research Context Only\n"
            "Confidence: Group-Level Population Average"
        ),
        'atlas_context': (
            "---\n"
            "DATA GOVERNANCE NOTICE:\n"
            "All atlas-derived data in this report represents population "
            "averages from published research atlases. Cross-atlas mapping "
            "involves inherent spatial uncertainty. This data is provided "
            "for informational enrichment only and is NOT patient-specific "
            "clinical evidence.\n"
            "Classification: Research Context Only"
        )
    }
    return caveats.get(data_type, caveats['atlas_context'])
```

---

## 8. Provenance & Confidence Model

### 8.1 Provenance Tracking

Every atlas data element must carry a complete provenance chain:

```python
@dataclass
class AtlasDataProvenance:
    """Complete provenance record for atlas-derived data."""
    
    # Data source identification
    source_atlas: str              # e.g., "Allen Human Brain Atlas"
    source_version: str            # e.g., "2023-06"
    source_api_endpoint: str       # Full API URL used
    
    # Query parameters
    query_parameters: Dict[str, Any]
    query_timestamp: str           # ISO 8601
    
    # Data lineage
    raw_data_hash: str             # SHA-256 of raw API response
    processing_steps: List[str]    # e.g., ["parsing", "aggregation", "mapping"]
    
    # Governance flags
    clinical_status: str           # Always "RESEARCH_CONTEXT_ONLY"
    data_type: str                 # "population_average" or "group_level"
    patient_specific: bool         # Always False
    
    # License
    license: str                   # "CC BY 4.0"
    attribution: str               # Required citation text
    
    # Confidence
    confidence_level: str          # HIGH / MEDIUM / LOW / INDIRECT
    confidence_factors: List[str]  # Reasons for confidence assignment
    
    # Display context
    display_category: str          # "gene_expression" / "network_topology" / "coordinate"
    required_caveats: List[str]    # List of caveat IDs to display


# Provenance record examples
EXAMPLE_PROVENANCE = {
    "gene_expression_drd2_dlpfc": AtlasDataProvenance(
        source_atlas="Allen Human Brain Atlas",
        source_version="microarray_v2",
        source_api_endpoint=(
            "http://api.brain-map.org/api/v2/data/query.json?"
            "criteria=service::human_microarray_expression"
            "[probes$eq{probe_ids}][structures$eq{structure_id}]"
        ),
        query_parameters={"gene": "DRD2", "structure_id": 4249},
        query_timestamp="2025-06-18T10:30:00Z",
        raw_data_hash="sha256:a1b2c3d4...",
        processing_steps=[
            "api_query", 
            "probe_resolution",
            "donor_aggregation",
            "zscore_computation",
            "cross_atlas_mapping"
        ],
        clinical_status="RESEARCH_CONTEXT_ONLY",
        data_type="population_average",
        patient_specific=False,
        license="CC BY 4.0",
        attribution=(
            "Data from Allen Human Brain Atlas "
            "(Hawrylycz et al., 2012; PMID: 22645204)"
        ),
        confidence_level="MEDIUM",
        confidence_factors=[
            "Direct structure-to-parcel mapping",
            "n=6 donors (small sample)",
            "Post-mortem tissue (not in vivo)",
            "Cross-subject normalization applied"
        ],
        display_category="gene_expression",
        required_caveats=["population_average", "small_n", "postmortem"]
    ),
    
    "network_schaefer_400_dlpfc": AtlasDataProvenance(
        source_atlas="Schaefer 2018",
        source_version="Schaefer2018_400Parcels_7Networks",
        source_api_endpoint="nilearn.datasets.fetch_atlas_schaefer_2018",
        query_parameters={"n_rois": 400, "yeo_networks": 7, "resolution_mm": 1},
        query_timestamp="2025-06-18T10:30:00Z",
        raw_data_hash="sha256:e5f6g7h8...",
        processing_steps=["atlas_loading", "mni_to_parcel_mapping"],
        clinical_status="RESEARCH_CONTEXT_ONLY",
        data_type="group_level",
        patient_specific=False,
        license="CC BY 4.0",
        attribution=(
            "Schaefer A, et al. (2018) Cereb Cortex. "
            "Local-Global Parcellation of the Human Cerebral Cortex "
            "from Intrinsic Functional Connectivity MRI. "
            "https://doi.org/10.1093/cercor/bhx179"
        ),
        confidence_level="HIGH",
        confidence_factors=[
            "Direct coordinate lookup in atlas volume",
            "Large derivation cohort (n=1489)",
            "Well-validated parcellation",
            "MNI space alignment verified"
        ],
        display_category="network_topology",
        required_caveats=["group_level", "not_patient_specific"]
    )
}
```

### 8.2 Confidence Model

```python
# ============================================================
# CONFIDENCE SCORING MODEL
# ============================================================

class ConfidenceScorer:
    """
    Multi-dimensional confidence scoring for atlas-derived data.
    
    Confidence is assessed across five dimensions:
    1. Spatial accuracy (coordinate mapping precision)
    2. Data quality (sample size, assay quality)
    3. Cross-atlas consistency (agreement between atlases)
    4. Temporal stability (consistency across time/scans)
    5. Clinical relevance (relevance to clinical question)
    """
    
    def score_gene_expression(self, n_donors: int, z_score: float,
                              structure_precision: float,
                              cross_atlas_agreement: float) -> dict:
        """
        Score confidence in gene expression data.
        
        Parameters:
        -----------
        n_donors : Number of donors with data for this gene/structure
        z_score : Expression z-score magnitude
        structure_precision : Spatial precision of structure mapping (mm)
        cross_atlas_agreement : Consistency with other atlases (0-1)
        """
        
        # Dimension 1: Spatial accuracy (0-1)
        spatial_score = max(0, 1 - structure_precision / 20)
        
        # Dimension 2: Data quality (0-1)
        # n=6 is maximum; scale accordingly
        data_quality = min(n_donors / 6, 1.0) * 0.7 + 0.3  # Floor at 0.3
        
        # Dimension 3: Expression magnitude signal (0-1)
        expression_signal = min(abs(z_score) / 3, 1.0)
        
        # Dimension 4: Cross-atlas consistency (0-1)
        consistency = cross_atlas_agreement
        
        # Weighted aggregate (gene expression weights)
        weights = [0.25, 0.25, 0.25, 0.25]
        scores = [spatial_score, data_quality, expression_signal, consistency]
        
        aggregate = sum(w * s for w, s in zip(weights, scores))
        
        # Map to confidence level
        if aggregate >= 0.7:
            level = 'HIGH'
        elif aggregate >= 0.4:
            level = 'MEDIUM'
        else:
            level = 'LOW'
        
        return {
            'aggregate_score': round(aggregate, 3),
            'confidence_level': level,
            'dimension_scores': {
                'spatial_accuracy': round(spatial_score, 3),
                'data_quality': round(data_quality, 3),
                'expression_signal': round(expression_signal, 3),
                'cross_atlas_consistency': round(consistency, 3)
            },
            'scoring_weights': dict(zip(
                ['spatial', 'data_quality', 'expression', 'consistency'],
                weights
            ))
        }
    
    def score_network_assignment(self, distance_to_centroid_mm: float,
                                  atlas_resolution: int,
                                  network_consensus: float) -> dict:
        """
        Score confidence in network assignment.
        
        Parameters:
        -----------
        distance_to_centroid_mm : Distance from MNI to parcel centroid
        atlas_resolution : Number of parcels (100-1000)
        network_consensus : Assignment consistency across methods
        """
        
        # Dimension 1: Spatial precision
        spatial_score = max(0, 1 - distance_to_centroid_mm / 10)
        
        # Dimension 2: Atlas resolution
        resolution_score = min(atlas_resolution / 1000, 1.0)
        
        # Dimension 3: Network consensus
        consensus_score = network_consensus
        
        weights = [0.4, 0.2, 0.4]
        scores = [spatial_score, resolution_score, consensus_score]
        
        aggregate = sum(w * s for w, s in zip(weights, scores))
        
        if aggregate >= 0.7:
            level = 'HIGH'
        elif aggregate >= 0.4:
            level = 'MEDIUM'
        else:
            level = 'LOW'
        
        return {
            'aggregate_score': round(aggregate, 3),
            'confidence_level': level,
            'dimension_scores': {
                'spatial_precision': round(spatial_score, 3),
                'atlas_resolution': round(resolution_score, 3),
                'network_consensus': round(consensus_score, 3)
            }
        }
```

### 8.3 Audit Trail

```python
# Audit logging for all atlas queries
import logging

class AtlasAuditLogger:
    """Comprehensive audit logging for atlas data access."""
    
    def __init__(self):
        self.logger = logging.getLogger('deepsynaps.atlas.audit')
    
    def log_query(self, provenance: AtlasDataProvenance, 
                  user_id: str, session_id: str):
        """Log atlas data query for audit trail."""
        self.logger.info({
            'event': 'atlas_query',
            'timestamp': provenance.query_timestamp,
            'user_id': user_id,
            'session_id': session_id,
            'source_atlas': provenance.source_atlas,
            'data_type': provenance.data_type,
            'clinical_status': provenance.clinical_status,
            'confidence_level': provenance.confidence_level,
            'query_parameters': provenance.query_parameters
        })
    
    def log_display(self, provenance: AtlasDataProvenance,
                    display_context: str, user_id: str):
        """Log when atlas data is displayed to user."""
        self.logger.info({
            'event': 'atlas_display',
            'timestamp': datetime.now().isoformat(),
            'user_id': user_id,
            'source_atlas': provenance.source_atlas,
            'display_category': provenance.display_category,
            'caveats_shown': provenance.required_caveats,
            'display_context': display_context
        })
```

---

## 9. DeepTwin Network Integration

### 9.1 DeepTwin Enrichment Architecture

DeepTwin is DeepSynaps' region-level knowledge enrichment system. PHASE 2 adds network biology context:

```
+------------------------------------------------------------------+
|                        DeepTwin v2.0                               |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  | MNI Coordinate   |  | Atlas Adapters   |  | Clinical         |  |
|  | Input            |  | (ABA + Schaefer) |  | Knowledge Base   |  |
|  | (x, y, z)        |  |                  |  |                  |  |
|  +--------+---------+  +--------+---------+  +--------+---------+  |
|           |                     |                     |            |
|           v                     v                     v            |
|  +--------------------------------------------------------------+  |
|  |                 DeepTwin Enrichment Engine                    |  |
|  |                                                               |  |
|  |  Layer 1: Spatial Resolution                                  |  |
|  |  - MNI -> Schaefer parcel (network assignment)                |  |
|  |  - MNI -> ABA structure (gene expression context)             |  |
|  |  - MNI -> Harvard-Oxford (anatomical label)                   |  |
|  |                                                               |  |
|  |  Layer 2: Network Context                                     |  |
|  |  - Network membership (Yeo 7/17)                              |  |
|  |  - Network hub status (centrality from literature)              |  |
|  |  - Cross-network connectivity patterns                        |  |
|  |                                                               |  |
|  |  Layer 3: Molecular Context                                   |  |
|  |  - Gene expression for neuromodulation targets                |  |
|  |  - Neurotransmitter receptor density                          |  |
|  |  - Cell type composition (from literature)                    |  |
|  |                                                               |  |
|  |  Layer 4: Clinical Context                                    |  |
|  |  - Evidence for TMS/tDCS targets (from literature)            |  |
|  |  - Network dysfunction patterns (from literature)             |  |
|  |  - Safety considerations                                      |  |
|  +--------------------------------------------------------------+  |
|                              |                                     |
|                              v                                     |
|  +--------------------------------------------------------------+  |
|  |                 Enriched Region Profile                        |  |
|  |  (Structured JSON with provenance, confidence, caveats)        |  |
|  +--------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### 9.2 DeepTwin Region Profile Format

```python
# DeepTwin v2 enriched region profile schema
DEEPTWIN_REGION_PROFILE_SCHEMA = {
    "version": "2.0.0",
    "generated_at": "ISO-8601 timestamp",
    
    "input": {
        "mni_coordinates": {"x": float, "y": float, "z": float},
        "query_context": str,  # e.g., "tms_target_planning"
        "indication": str,     # e.g., "treatment_resistant_depression"
    },
    
    "spatial_resolution": {
        "schaefer_parcel": {
            "label": str,
            "network": str,
            "hemisphere": str,
            "parcel_index": int,
            "n_rois": int,
            "distance_to_centroid_mm": float,
            "confidence": str,
            "provenance": "..."
        },
        "aba_structure": {
            "name": str,
            "acronym": str,
            "structure_id": int,
            "parent_structure": str,
            "distance_to_sample_mm": float,
            "confidence": str,
            "provenance": "..."
        },
        "harvard_oxford_region": {
            "name": str,
            "probability": float,
            "confidence": str
        }
    },
    
    "network_context": {
        "network_membership": {
            "yeo_7": str,
            "yeo_17": str,
            "network_description": str
        },
        "network_properties": {
            "is_hub_region": bool,
            "hub_type": str,  # "connector" or "provincial"
            "network_centrality": float,
            "known_connections": list
        },
        "functional_significance": {
            "primary_functions": list,
            "clinical_relevance": str,
            "literature_references": list
        }
    },
    
    "molecular_context": {
        "gene_expression": {
            "available": bool,
            "genes_profiled": list,
            "expression_summary": list,  # top genes with z-scores
            "dominant_neurotransmitters": list,
            "receptor_profile": dict,
            "donor_count": int,
            "provenance": "..."
        },
        "cell_type_context": {
            "primary_cell_types": list,
            "layer_specificity": str,
            "cortical_layer": str  # if applicable
        }
    },
    
    "neuromodulation_context": {
        "tms_relevance": {
            "is_established_target": bool,
            "target_type": str,  # "primary", "secondary", "investigational"
            "typical_protocols": list,
            "efficacy_evidence": str,
            "safety_considerations": list
        },
        "tdcs_relevance": {
            "is_established_target": bool,
            "target_type": str,
            "typical_montages": list,
            "efficacy_evidence": str
        }
    },
    
    "governance": {
        "clinical_status": "RESEARCH_CONTEXT_ONLY",
        "patient_specific": False,
        "confidence_aggregate": str,
        "caveats_required": list,
        "attribution_required": str,
        "license": "CC BY 4.0"
    }
}
```

### 9.3 Example DeepTwin Output

```json
{
  "version": "2.0.0",
  "generated_at": "2025-06-18T14:30:00Z",
  
  "input": {
    "mni_coordinates": {"x": -38, "y": 44, "z": 30},
    "query_context": "tms_target_planning",
    "indication": "treatment_resistant_depression"
  },
  
  "spatial_resolution": {
    "schaefer_parcel": {
      "label": "7Networks_LH_FrontPar_1",
      "network": "FrontPar",
      "hemisphere": "LH",
      "parcel_index": 157,
      "n_rois": 400,
      "distance_to_centroid_mm": 2.3,
      "confidence": "HIGH",
      "provenance": "Direct coordinate lookup in Schaefer400 1mm atlas"
    },
    "aba_structure": {
      "name": "middle frontal gyrus, left",
      "acronym": "MFG",
      "structure_id": 8659,
      "parent_structure": "frontal lobe",
      "distance_to_sample_mm": 4.1,
      "confidence": "MEDIUM",
      "provenance": "Nearest AHBA sample within MFG structure"
    }
  },
  
  "network_context": {
    "network_membership": {
      "yeo_7": "Frontoparietal",
      "yeo_17": "ContA",
      "network_description": "Executive control and working memory network"
    },
    "network_properties": {
      "is_hub_region": true,
      "hub_type": "connector",
      "network_centrality": 0.78,
      "known_connections": [
        "dorsolateral prefrontal cortex",
        "inferior parietal lobule",
        "anterior cingulate cortex"
      ]
    }
  },
  
  "molecular_context": {
    "gene_expression": {
      "available": true,
      "genes_profiled": ["BDNF", "DRD2", "SLC6A4", "HTR2A"],
      "expression_summary": [
        {"gene": "BDNF", "z_score": 0.82, "level": "moderate"},
        {"gene": "DRD2", "z_score": -0.34, "level": "low"},
        {"gene": "SLC6A4", "z_score": 1.45, "level": "moderate"},
        {"gene": "HTR2A", "z_score": 0.67, "level": "moderate"}
      ],
      "donor_count": 6,
      "provenance": "Allen Human Brain Atlas microarray data"
    }
  },
  
  "governance": {
    "clinical_status": "RESEARCH_CONTEXT_ONLY",
    "patient_specific": false,
    "confidence_aggregate": "MEDIUM",
    "caveats_required": [
      "population_average",
      "group_level_network",
      "postmortem_expression"
    ],
    "attribution": "Allen Human Brain Atlas (CC BY 4.0); Schaefer 2018 (CC BY 4.0)",
    "license": "CC BY 4.0"
  }
}
```

### 9.4 Network Context API

```python
class NetworkContextAPI:
    """API for retrieving network context for brain regions."""
    
    # Network functional descriptions
    NETWORK_DESCRIPTIONS = {
        'Vis': {
            'full_name': 'Visual Network',
            'primary_functions': [
                'Visual processing and perception',
                'Object recognition',
                'Spatial navigation'
            ],
            'clinical_relevance': (
                'Relevant for visual neglect, hallucinations, "
                'and visual processing disorders'
            ),
            'key_regions': ['V1', 'V2', 'V3', 'V4', 'MT+', 'LOC'],
            'neuromodulation_targets': []  # Generally not targeted
        },
        'SomMot': {
            'full_name': 'Somatomotor Network',
            'primary_functions': [
                'Motor planning and execution',
                'Somatosensory processing',
                'Motor learning'
            ],
            'clinical_relevance': (
                'Target for motor rehabilitation, stroke recovery, "
                'movement disorders, chronic pain'
            ),
            'key_regions': ['M1', 'S1', 'SMA', 'premotor cortex'],
            'neuromodulation_targets': ['M1', 'SMA']
        },
        'DorsAttn': {
            'full_name': 'Dorsal Attention Network',
            'primary_functions': [
                'Top-down attentional control',
                'Visuospatial attention',
                'Voluntary attention orienting'
            ],
            'clinical_relevance': (
                'Relevant for attention deficits, neglect, ADHD'
            ),
            'key_regions': ['FEF', 'IPS', 'SPL'],
            'neuromodulation_targets': ['FEF', 'IPS']
        },
        'VentAttn': {
            'full_name': 'Ventral Attention / Salience Network',
            'primary_functions': [
                'Bottom-up attention capture',
                'Salience detection',
                'Interoceptive awareness',
                'Autonomic regulation'
            ],
            'clinical_relevance': (
                'Target for PTSD, anxiety, addiction, depression; "
                'key hub for therapeutic TMS (DLPFC targeting)'
            ),
            'key_regions': ['TPJ', 'IFG', 'ACC', 'insula'],
            'neuromodulation_targets': ['DLPFC (via FPN-SN interactions)']
        },
        'Limbic': {
            'full_name': 'Limbic Network',
            'primary_functions': [
                'Emotional processing',
                'Motivation and reward',
                'Memory encoding',
                'Social cognition'
            ],
            'clinical_relevance': (
                'Relevant for depression, anxiety, addiction, "
                'bipolar disorder, social cognition deficits'
            ),
            'key_regions': ['OFC', 'temporal pole', 'hippocampus', 'amygdala'],
            'neuromodulation_targets': []  # Deep brain targets (not TMS)
        },
        'FrontPar': {
            'full_name': 'Frontoparietal Network',
            'primary_functions': [
                'Executive control',
                'Working memory',
                'Cognitive flexibility',
                'Goal-directed behavior'
            ],
            'clinical_relevance': (
                'Primary target for depression (DLPFC), "
                'OCD, cognitive enhancement, ADHD'
            ),
            'key_regions': ['DLPFC', 'IPL', 'pre-SMA', 'ACC'],
            'neuromodulation_targets': ['DLPFC', 'pre-SMA', 'IPL']
        },
        'Default': {
            'full_name': 'Default Mode Network',
            'primary_functions': [
                'Self-referential processing',
                'Mind-wandering',
                'Autobiographical memory',
                'Theory of mind'
            ],
            'clinical_relevance': (
                'Altered connectivity in depression, ADHD, "
                'autism, schizophrenia, Alzheimer's disease'
            ),
            'key_regions': ['MPFC', 'PCC', 'angular gyrus', 'MTL'],
            'neuromodulation_targets': ['PCC (investigational)']
        }
    }
    
    def get_network_context(self, network_name: str) -> dict:
        """Get comprehensive network context for display."""
        context = self.NETWORK_DESCRIPTIONS.get(network_name, {})
        
        return {
            **context,
            'display_caveat': (
                f"This network description reflects group-level "
                f"functional organization from resting-state fMRI "
                f"studies (~1,500 subjects). It does not represent "
                f"this patient's individual functional connectivity."
            ),
            'governance': {
                'source': 'Yeo 2011; Schaefer 2018',
                'license': 'CC BY 4.0',
                'context': 'research_only'
            }
        }
```

---

## 10. Licensing

### 10.1 Allen Brain Atlas

| Component | License | Terms |
|-----------|---------|-------|
| **Allen Human Brain Atlas** | CC BY 4.0 | Attribution required; share-alike for derivatives |
| **Allen Mouse Brain Atlas** | CC BY 4.0 | Attribution required |
| **Allen Developing Mouse Brain Atlas** | CC BY 4.0 | Attribution required |
| **BrainSpan Atlas** | CC BY 4.0 | Attribution required |
| **AllenSDK** | BSD 2-Clause | Permissive open source |

**Required Attribution:**
```
Hawrylycz MJ, et al. (2012) An anatomically comprehensive atlas of the 
adult human brain transcriptome. Nature 489(7416):391-7. 
PMID: 22996582
```

```
Allen Human Brain Atlas [Internet]. Seattle (WA): Allen Institute for 
Brain Science. Available from: https://brain-map.org.
Used under CC BY 4.0 license.
```

### 10.2 Schaefer Parcellation

| Component | License | Terms |
|-----------|---------|-------|
| **Schaefer 2018 Atlas** | CC BY 4.0 | Attribution required |
| **Nilearn (fetch function)** | BSD 3-Clause | Permissive |

**Required Attribution:**
```
Schaefer A, Kong R, Gordon EM, Laumann TO, Zuo XN, Holmes AJ, 
Eickhoff SB, Yeo BTT. (2018) Local-Global Parcellation of the Human 
Cerebral Cortex from Intrinsic Functional Connectivity MRI. 
Cerebral Cortex 28(9):3095-3114.
```

```
Yeo BTT, et al. (2011) The organization of the human cerebral cortex 
estimated by intrinsic functional connectivity. Journal of 
Neurophysiology 106(3):1125-65.
```

### 10.3 Yeo Networks

| Component | License | Terms |
|-----------|---------|-------|
| **Yeo 2011 Networks** | CC BY 4.0 | Attribution required |

**Required Attribution:**
```
Yeo BTT, Krienen FM, Sepulcre J, Sabuncu MR, Lashkari D, 
Hollinshead M, Roffman JL, Smoller JW, Zollei L, Polimeni JR, 
Fischl B, Liu H, Buckner RL. (2011) The organization of the human 
cerebral cortex estimated by intrinsic functional connectivity. 
Journal of Neurophysiology 106(3):1125-1165.
```

### 10.4 DeepSynaps Integration Code

All integration adapters and code developed by DeepSynaps for atlas integration are proprietary internal code. However, the underlying atlas data accessed through these adapters remains governed by the original CC BY 4.0 licenses.

### 10.5 License Compliance Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Attribution on every atlas data display | Required | Auto-injected via DisplayRulesEngine |
| CC BY 4.0 badge/link | Required | Shown in all atlas data panels |
| No additional restrictions on data use | Verified | DeepSynaps does not impose restrictions |
| Share-alike for derivative datasets | Tracked | Any derived datasets must be CC BY 4.0 |
| Source URL reference | Required | Links to brain-map.org on all displays |

---

## 11. Implementation Recommendations

### 11.1 Phase 2A: Foundation (Sprint 1-2)

**Priority: Critical**

| Task | Effort | Dependencies |
|------|--------|-------------|
| Implement ABA API adapter with caching | 3 days | HTTP client, cache store |
| Implement Schaefer adapter (all resolutions) | 2 days | Nilearn, nibabel |
| Build MNI-to-parcel coordinate lookup | 2 days | Schaefer NIfTI data |
| Implement basic display banners | 1 day | UI component library |
| Add provenance tracking infrastructure | 2 days | Logging, data models |

**Key technical decisions:**
1. Use direct RMA API calls (not AllenSDK) for human brain atlas data
2. Cache atlas NIfTI files locally (Schaefer ~50MB per resolution)
3. Cache ABA structure tree (ontology) -- updated annually
4. Implement rate limiting for ABA API (respect fair use)

### 11.2 Phase 2B: Enrichment (Sprint 3-4)

**Priority: High**

| Task | Effort | Dependencies |
|------|--------|-------------|
| Build cross-atlas mapping table (ABA <-> Schaefer) | 3 days | Both adapters |
| Implement gene expression context service | 4 days | ABA adapter, gene panels |
| Build confidence scoring model | 2 days | Mapping table, metrics |
| Integrate DeepTwin enrichment pipeline | 3 days | All above components |
| Add network context descriptions | 2 days | Literature database |

### 11.3 Phase 2C: DeepTwin Integration (Sprint 5-6)

**Priority: High**

| Task | Effort | Dependencies |
|------|--------|-------------|
| Build DeepTwin v2 region profile format | 2 days | Schema design |
| Integrate with existing MNI adapter | 3 days | Phase 1 MNI code |
| Add neuromodulation target relevance scoring | 3 days | Clinical KB |
| Implement export/report generation with caveats | 2 days | Template system |
| Add audit logging for all atlas queries | 2 days | Logging infrastructure |

### 11.4 Phase 2D: Polish (Sprint 7-8)

**Priority: Medium**

| Task | Effort | Dependencies |
|------|--------|-------------|
| UI polish for atlas data panels | 2 days | Design system |
| Performance optimization (lazy loading) | 2 days | Cache tuning |
| User testing with clinicians | 3 days | Working prototype |
| Documentation and training materials | 2 days | All features |

### 11.5 Technical Architecture Decisions

#### Decision 1: Atlas Loading Strategy
```
Option A: Load all resolutions at startup
Option B: Lazy-load on demand (chosen)
Option C: Pre-generate mapping tables

Rationale: Option B balances memory usage and responsiveness.
Schaefer 1000 at 1mm = ~100MB NIfTI; loading all resolutions 
would consume ~400MB RAM unnecessarily.
```

#### Decision 2: ABA API Caching Strategy
```
Option A: No caching (live API calls only)
Option B: Aggressive caching with TTL (chosen)
Option C: Full local database replication

Rationale: ABA data changes infrequently. 24-hour TTL cache
with persistent storage provides responsiveness while
maintaining data freshness.
```

#### Decision 3: Cross-Atlas Mapping Method
```
Option A: Pre-computed lookup table (chosen)
Option B: Real-time nearest-neighbor search
Option C: Probabilistic multi-atlas fusion

Rationale: Pre-computed table provides O(1) lookup with
known error bounds. Real-time NN adds unnecessary latency.
```

### 11.6 Code Structure

```
depsynaps/
  apps/
    api/
      adapters/
        __init__.py
        allen_brain_atlas.py      # ABA API adapter
        schaefer_atlas.py         # Schaefer parcellation adapter
        multi_atlas_resolver.py   # Cross-atlas mapping engine
      services/
        __init__.py
        gene_expression_context.py  # Gene context service
        network_context.py          # Network context service
        deeptwin_enrichment.py      # DeepTwin v2 pipeline
      models/
        __init__.py
        provenance.py             # Provenance data models
        confidence.py             # Confidence scoring models
        region_profile.py         # DeepTwin region profile schema
      governance/
        __init__.py
        display_rules.py          # Display rule engine
        caveat_injector.py        # Caveat injection system
        audit_logger.py           # Audit trail logging
      research/
        PHASE2_BRAIN_ATLAS_NETWORK_REPORT.md  # This document
```

### 11.7 Testing Strategy

```python
# Test coverage requirements
TEST_STRATEGY = {
    'unit_tests': {
        'aba_adapter': [
            'test_rma_query_construction',
            'test_gene_expression_parsing',
            'test_error_handling',
            'test_cache_behavior'
        ],
        'schaefer_adapter': [
            'test_atlas_loading_all_resolutions',
            'test_mni_to_parcel_lookup',
            'test_nearest_parcel_search',
            'test_label_parsing'
        ],
        'confidence_scorer': [
            'test_spatial_accuracy_scoring',
            'test_data_quality_scoring',
            'test_aggregate_confidence'
        ]
    },
    'integration_tests': {
        'cross_atlas_mapping': [
            'test_aba_to_schaefer_mapping',
            'test_multi_atlas_resolution',
            'test_confidence_consistency'
        ],
        'deeptwin_pipeline': [
            'test_end_to_end_enrichment',
            'test_governance_flag_injection',
            'test_caveat_display'
        ]
    },
    'performance_tests': {
        'atlas_loading': 'Target: <2s for any resolution',
        'mni_lookup': 'Target: <100ms per coordinate',
        'expression_query': 'Target: <3s with caching',
        'batch_queries': 'Target: <10s for 100 coordinates'
    }
}
```

---

## 12. Risks & Mitigations

### 12.1 Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|-----------|--------|------------|-------|
| R1 | Users misinterpret atlas data as patient-specific diagnosis | High | Critical | **Mandatory display banners** on every atlas panel; explicit "research context only" labels; training materials; audit trail | Governance |
| R2 | Allen Brain Atlas API changes or becomes unavailable | Low | High | **Persistent cache** with 30-day TTL; graceful degradation; monitoring alerts | Engineering |
| R3 | Cross-atlas mapping errors lead to incorrect context | Medium | High | **Confidence scoring** with explicit uncertainty; manual validation of key mappings; user feedback mechanism | Data Science |
| R4 | Clinicians rely on gene expression for treatment decisions | Medium | Critical | **Multi-layer governance**: display banners, tooltip caveats, export disclaimers, audit logging, periodic training | Clinical Safety |
| R5 | Small sample size (n=6 donors) limits generalizability | N/A | Medium | **Explicit donor count display**; confidence scoring downgrades for borderline cases; acknowledge limitation in all displays | Data Science |
| R6 | Schaefer parcellation only covers cortex (no subcortex) | N/A | Medium | **Document limitation**; supplement with Harvard-Oxford subcortical atlas; indicate missing coverage | Data Science |
| R7 | Performance issues with high-resolution atlases | Medium | Medium | **Lazy loading**; caching; pre-computed centroid lookup tables; optional resolution selection | Engineering |
| R8 | License compliance failure | Low | High | **Automated attribution injection**; license badges; regular compliance audits; legal review | Legal |
| R9 | Data drift: Atlas updates change mappings | Low | Medium | **Version pinning**; automated regression tests on atlas updates; change log tracking | Engineering |
| R10 | User confusion between structural and functional connectivity | Medium | Medium | **Educational content** integrated in UI; explicit labels; tooltip explanations | UX/Clinical |

### 12.2 Critical Risk: Clinical Misinterpretation

**Risk Statement:** Clinicians or users may interpret atlas-derived data (gene expression, network labels) as patient-specific clinical evidence, potentially leading to inappropriate clinical decisions.

**Mitigation Strategy (Defense in Depth):**

```
Layer 1: Data Source (always research/contextual)
- All atlas data tagged as population-average at ingestion
- No patient-specific atlas data exists in the system

Layer 2: Processing Pipeline
- Confidence scoring downgrades all atlas-derived data
- Provenance tracking for every data element
- Automated governance flag injection

Layer 3: Display Rules
- Mandatory research-context banners on every panel
- Color-coded confidence indicators (green/orange/red)
- Hover tooltips with explicit caveats

Layer 4: Export/Documents
- Auto-injected disclaimers in all exported reports
- Footer caveats on printed materials
- Watermark on shared documents

Layer 5: Training & Culture
- Clinical user training on atlas data interpretation
- Regular refreshers on governance rules
- Peer review of atlas data displays

Layer 6: Audit & Compliance
- Complete audit trail of all atlas data access
- Regular compliance reviews
- Incident reporting for governance violations
```

### 12.3 Risk Monitoring Dashboard

```python
# Key risk indicators to monitor
RISK_KPIs = {
    'governance_compliance_rate': {
        'target': '100%',
        'measurement': 'Fraction of atlas displays with all required banners',
        'frequency': 'Real-time'
    },
    'api_availability': {
        'target': '>99%',
        'measurement': 'ABA API uptime over 30 days',
        'frequency': 'Daily'
    },
    'cache_hit_rate': {
        'target': '>80%',
        'measurement': 'Cache hits / total atlas queries',
        'frequency': 'Daily'
    },
    'average_lookup_latency': {
        'target': '<200ms',
        'measurement': 'P95 MNI-to-parcel lookup time',
        'frequency': 'Real-time'
    },
    'user_confusion_incidents': {
        'target': '0',
        'measurement': 'Reported cases of atlas data misinterpretation',
        'frequency': 'Weekly review'
    }
}
```

---

## 13. Appendices

### Appendix A: Complete API Endpoint Reference

```
Allen Brain Atlas API v2 -- Complete Endpoint Reference
Base URL: http://api.brain-map.org/api/v2/

--- Core RMA Endpoints ---

GET /data/{Model}/{id}.json          -- Single resource by ID
GET /data/{Model}/query.json         -- Query across resources
GET /data/query.json                 -- General query (no model)
GET /data/{Model}/describe.json      -- Model associations
GET /data/enumerate.json             -- All models

--- Data Models ---

Model: Donor                          -- Brain donors
Model: Specimen                       -- Tissue specimens
Model: SectionDataSet                 -- Experiment metadata
Model: Structure                      -- Anatomical structures
Model: Gene                           -- Gene entities
Model: Probe                          -- Microarray probes
Model: SectionImage                   -- ISH images
Model: StructureUnionize              -- Aggregate expression stats

--- Human Brain Atlas Services ---

GET /data/query.json?criteria=service::human_microarray_expression
  Parameters:
    [probes$eq{probe_ids}]            -- Comma-separated probe IDs
    [donors$eq{donor_ids}]            -- Comma-separated donor IDs (optional)
    [structures$eq{structure_ids}]    -- Comma-separated structure IDs (optional)
  Returns: Expression levels and z-scores

GET /data/query.json?criteria=service::human_microarray_differential
  Parameters:
    [structures1$eq{ids}]             -- Contrast (reference) structures
    [structures2$eq{ids}]             -- Target structures
    [sort_by$eq'fold-change']         -- Sort by fold-change or p-value
  Returns: Differentially expressed genes

GET /data/query.json?criteria=service::human_microarray_correlation
  Parameters:
    [probes$eq{probe_id}]             -- Seed probe ID
    [structures$eq{structure_id}]     -- Structure to search within
  Returns: Correlated probes (Pearson r)

--- Download Endpoints ---

GET /well_known_file_download/{id}   -- Download well-known files
GET /section_image_download/{id}     -- Download ISH images
GET /atlas_image_download/{id}       -- Download atlas images
GET /grid_data/file/{id}             -- Download 3D expression grid
GET /structure_graph_download/{id}.json  -- Download structure ontology

--- Spatial/Coordinate Endpoints ---

GET /image_to_atlas                  -- Map image to atlas coordinates
GET /image_to_reference              -- Map image to reference space
GET /reference_to_image              -- Map reference to image space

--- Allen Mouse Connectivity Atlas ---

GET /data/query.json?criteria=service::mouse_connectivity_injection_structure
GET /data/query.json?criteria=service::mouse_connectivity_target_spatial
```

### Appendix B: Schaefer Atlas Loading Quick Reference

```python
from nilearn.datasets import fetch_atlas_schaefer_2018

# All available configurations
CONFIGS = [
    # (n_rois, yeo_networks, resolution_mm, description)
    (100,  7, 1, "Coarse 7-network cortical parcellation"),
    (100,  7, 2, "Coarse 7-network, 2mm resolution"),
    (100, 17, 1, "Coarse 17-network cortical parcellation"),
    (100, 17, 2, "Coarse 17-network, 2mm resolution"),
    (200,  7, 1, "Balanced 7-network (recommended for clinical)"),
    (200,  7, 2, "Balanced 7-network, 2mm"),
    (200, 17, 1, "Balanced 17-network"),
    (300,  7, 1, "Intermediate 7-network"),
    (300, 17, 1, "Intermediate 17-network"),
    (400,  7, 1, "Standard 7-network (most common in research)"),
    (400, 17, 1, "Standard 17-network"),
    (400,  7, 2, "Standard 7-network, 2mm"),
    (500,  7, 1, "High-resolution 7-network"),
    (500, 17, 1, "High-resolution 17-network"),
    (600,  7, 1, "Detailed 7-network"),
    (600, 17, 1, "Detailed 17-network"),
    (800,  7, 1, "Very high-resolution 7-network"),
    (800, 17, 1, "Very high-resolution 17-network"),
    (1000,  7, 1, "Maximum 7-network granularity"),
    (1000, 17, 1, "Maximum 17-network granularity"),
]

def load_all_configs():
    """Load all Schaefer atlas configurations."""
    atlases = {}
    for n_rois, yeo_nets, mm, desc in CONFIGS:
        key = f"{n_rois}_{yeo_nets}_{mm}mm"
        atlases[key] = {
            'atlas': fetch_atlas_schaefer_2018(n_rois, yeo_nets, mm),
            'description': desc
        }
    return atlases

# Quick lookup: common TMS targets
TMS_TARGETS = {
    'dlpfc_left': {
        'mni': (-38, 44, 30),
        'expected_network': 'FrontPar',
        'expected_parcel_200': '7Networks_LH_FrontPar_1'
    },
    'dlpfc_right': {
        'mni': (38, 44, 30),
        'expected_network': 'FrontPar',
        'expected_parcel_200': '7Networks_RH_FrontPar_1'
    },
    'm1_left': {
        'mni': (-37, -25, 58),
        'expected_network': 'SomMot',
        'expected_parcel_200': '7Networks_LH_SomMot_4'
    },
    'm1_right': {
        'mni': (37, -25, 58),
        'expected_network': 'SomMot',
        'expected_parcel_200': '7Networks_RH_SomMot_4'
    },
    'dmpfc': {
        'mni': (0, 52, 28),
        'expected_network': 'Default',
        'expected_parcel_200': '7Networks_LH_Default_1'
    },
    'ofc_left': {
        'mni': (-20, 34, -16),
        'expected_network': 'Limbic',
        'expected_parcel_200': '7Networks_LH_Limbic_1'
    },
    'sma': {
        'mni': (0, -14, 60),
        'expected_network': 'SomMot',
        'expected_parcel_200': '7Networks_LH_SomMot_1'
    }
}
```

### Appendix C: Network Neuroscience Glossary

| Term | Definition |
|------|------------|
| **Resting-state fMRI (rs-fMRI)** | fMRI acquired while subject is at rest (no explicit task) |
| **Functional connectivity (FC)** | Statistical correlation between BOLD time series of two regions |
| **Structural connectivity (SC)** | Anatomical white matter connection between regions (from DWI) |
| **Graph** | Mathematical model of network with nodes (regions) and edges (connections) |
| **Node degree** | Number of connections to a node |
| **Betweenness centrality** | Fraction of shortest paths that pass through a node |
| **Modularity (Q)** | Quality metric for network community structure |
| **Small-worldness** | Ratio of clustering/path-length relative to random graph |
| **Network-based statistic (NBS)** | Cluster-based multiple comparison correction for network edges |
| **Independent Component Analysis (ICA)** | Blind source separation for identifying RSNs |
| **Seed-based correlation** | FC computed between a seed region and all other voxels |
| **Parcellation** | Division of brain into discrete regions (parcels) |
| **Yeo networks** | 7 or 17 canonical resting-state networks from Yeo et al. (2011) |
| **Hub** | Highly connected node that facilitates between-module communication |
| **Rich club** | Subset of highly interconnected hub nodes |
| **Default mode network (DMN)** | RSN active during rest, deactivated during tasks |
| **Salience network** | RSN involved in detecting salient stimuli |
| **Frontoparietal network** | RSN involved in executive control and working memory |
| **BOLD signal** | Blood-oxygen-level-dependent contrast (fMRI signal) |
| **MNI space** | Standardized brain coordinate system (Montreal Neurological Institute) |

### Appendix D: Key References

```bibtex
% Allen Brain Atlas
@article{hawrylycz2012,
  title={An anatomically comprehensive atlas of the adult human brain transcriptome},
  author={Hawrylycz, MJ and Lein, ES and Guillozet-Bongaarts, AL and others},
  journal={Nature},
  volume={489},
  pages={391--399},
  year={2012}
}

% Schaefer Parcellation
@article{schaefer2018,
  title={Local-Global Parcellation of the Human Cerebral Cortex from 
         Intrinsic Functional Connectivity MRI},
  author={Schaefer, A and Kong, R and Gordon, EM and Laumann, TO and 
          Zuo, XN and Holmes, AJ and Eickhoff, SB and Yeo, BTT},
  journal={Cerebral Cortex},
  volume={28},
  number={9},
  pages={3095--3114},
  year={2018}
}

% Yeo Networks
@article{yeo2011,
  title={The organization of the human cerebral cortex estimated by 
         intrinsic functional connectivity},
  author={Yeo, BTT and Krienen, FM and Sepulcre, J and Sabuncu, MR and 
          Lashkari, D and Hollinshead, M and others},
  journal={Journal of Neurophysiology},
  volume={106},
  number={3},
  pages={1125--1165},
  year={2011}
}

% Network-Based Statistic
@article{zalesky2010,
  title={Network-based statistic: identifying differences in brain networks},
  author={Zalesky, A and Fornito, A and Bullmore, ET},
  journal={NeuroImage},
  volume={53},
  number={4},
  pages={1197--1207},
  year={2010}
}

% Graph Theory in Neuroscience (Review)
@article{sporns2018,
  title={Graph theory methods: applications in brain networks},
  author={Sporns, O},
  journal={Dialogues in Clinical Neuroscience},
  volume={20},
  pages={111--121},
  year={2018}
}

% Glasser Multi-modal Parcellation
@article{glasser2016,
  title={A multi-modal parcellation of human cerebral cortex},
  author={Glasser, MF and Coalson, TS and Robinson, EC and others},
  journal={Nature},
  volume={536},
  pages={171--178},
  year={2016}
}

% Fornito & Bullmore Network Neuroscience Book
@book{fornito2016,
  title={Fundamentals of Brain Network Analysis},
  author={Fornito, A and Zalesky, A and Bullmore, E},
  publisher={Academic Press},
  year={2016}
}

% Buckner Cerebellar Networks
@article{buckner2011,
  title={The organization of the human cerebellum estimated by 
         intrinsic functional connectivity},
  author={Buckner, RL and Krienen, FM and Castellanos, A and others},
  journal={Journal of Neurophysiology},
  volume={106},
  pages={2322--2345},
  year={2011}
}
```

### Appendix E: Governance Flag Reference

```python
# All governance flags used in DeepSynaps atlas integration
GOVERNANCE_FLAGS = {
    # Data origin flags
    'research_context_only': {
        'description': 'Data is for research context, not clinical evidence',
        'required_display': True,
        'display_priority': 1
    },
    'population_average': {
        'description': 'Data represents population average, not individual patient',
        'required_display': True,
        'display_priority': 1
    },
    'postmortem_data': {
        'description': 'Gene expression from post-mortem tissue',
        'required_display': True,
        'display_priority': 2
    },
    'small_sample_size': {
        'description': 'Small sample size (n<10) limits generalizability',
        'required_display': True,
        'display_priority': 2
    },
    'group_level_network': {
        'description': 'Network labels from group-level analysis',
        'required_display': True,
        'display_priority': 1
    },
    'cross_atlas_mapping': {
        'description': 'Cross-atlas mapping involves spatial uncertainty',
        'required_display': True,
        'display_priority': 2
    },
    'not_biomarker': {
        'description': 'Not a clinical biomarker',
        'required_display': True,
        'display_priority': 1
    },
    'cc_by_4_0': {
        'description': 'CC BY 4.0 licensed atlas data',
        'required_display': True,
        'display_priority': 3
    },
    'cortex_only': {
        'description': 'Schaefer atlas covers cortex only (no subcortex)',
        'required_display': False,
        'display_priority': 3
    },
    'microarray_assay': {
        'description': 'Gene expression measured by microarray',
        'required_display': False,
        'display_priority': 3
    }
}
```

### Appendix F: Quick Start Guide for Developers

```python
# ============================================================
# QUICK START: Integrating Atlas Data in DeepSynaps
# ============================================================

# Step 1: Initialize adapters
from adapters.allen_brain_atlas import AllenBrainAtlasAdapter
from adapters.schaefer_atlas import SchaeferAtlasAdapter
from services.gene_expression_context import GeneExpressionContextService

aba = AllenBrainAtlasAdapter(cache_dir="/data/aba_cache")
schaefer = SchaeferAtlasAdapter(data_dir="/data/schaefer")
gene_ctx = GeneExpressionContextService(aba)

# Step 2: Resolve MNI coordinate to atlas context
mni_target = (-38, 44, 30)  # Left DLPFC

# Get Schaefer network assignment
parcel_info = schaefer.find_parcel_by_mni(
    mni_target[0], mni_target[1], mni_target[2],
    n_rois=400, yeo_networks=7
)
print(f"Network: {parcel_info['network_name']}")
print(f"Parcel: {parcel_info['label']}")

# Get gene expression context
expression_ctx = gene_ctx.get_expression_context(
    mni_target, indication="depression_tms"
)
print(f"Top expressed gene: {expression_ctx['expression_data'][0]['gene']}")

# Step 3: Display with governance
from governance.display_rules import DisplayRulesEngine

display_engine = DisplayRulesEngine()
rendered = display_engine.render_region_context(
    mni=mni_target,
    schaefer_info=parcel_info,
    expression_ctx=expression_ctx,
    user_role="clinician"
)
# rendered now includes all mandatory banners and caveats

# Step 4: Audit logging
from governance.audit_logger import AtlasAuditLogger

audit = AtlasAuditLogger()
audit.log_query(
    provenance=expression_ctx['governance'],
    user_id="clinician_001",
    session_id="session_abc123"
)
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-06-18 | DeepSynaps Research | Initial comprehensive report |

**Classification:** Technical Integration Research  
**Distribution:** DeepSynaps Protocol Studio Engineering, Data Science, Clinical Safety  
**Review Cycle:** Quarterly  
**Next Review:** 2025-09-18  

---

*This document was prepared as a comprehensive technical integration research report for the DeepSynaps Protocol Studio Knowledge Layer (PHASE 2). All atlas data discussed is open-access research data licensed under CC BY 4.0. No clinical claims are made or implied. All atlas-derived data is explicitly designated as research context only, not patient-specific clinical evidence.*

*End of Report*
