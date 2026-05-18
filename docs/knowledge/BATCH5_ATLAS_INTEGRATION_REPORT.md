# Batch 5 Atlas Integration Report

## Overview

This report documents 5 P0 atlas/analytics database adapters built for the DeepSynaps Protocol Studio.

| # | Adapter | Database | Type | Confidence Tier | Auth Required |
|---|---------|----------|------|-----------------|---------------|
| 1 | `StringAdapter` | STRING | REST API (Live) | A | No |
| 2 | `MyVariantAdapter` | MyVariant.info | REST API (Live) | A | No |
| 3 | `Yeo2011Adapter` | Yeo 2011 Atlas | File-based (Static) | A | No |
| 4 | `Gordon2014Adapter` | Gordon 2014 Atlas | File-based (Static) | A | No |
| 5 | `Adhd200Adapter` | ADHD-200 Dataset | Download-based | A | No |

---

## 1. STRING Adapter (`string_adapter.py`)

### Database Info
- **Name:** STRING Protein-Protein Interaction Database
- **URL:** https://string-db.org/api/
- **Source:** STRING Consortium
- **Data:** 67M+ protein-protein interactions across 12,000+ species
- **Confidence Tier:** A (experimental + computational + text mining evidence)
- **Citation:** Szklarczyk D, et al. Nucleic Acids Res. 2023;51(D1):D638-D646

### API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/json/version` | GET | Database version info |
| `/json/interaction_partners` | GET | Get interaction partners for proteins |
| `/json/network` | GET | Retrieve full interaction network |
| `/json/enrichment` | GET | GO/KEGG pathway enrichment |
| `/image/network` | GET | Network visualization (PNG) |

### Search Parameters

```python
{
    "species": 9606,          # NCBI Taxon ID (9606=Human, 10090=Mouse)
    "limit": 10,              # Max interaction partners to return
    "required_score": 400,    # Minimum interaction score (0-1000)
    "network_flavor": "confidence",  # "confidence" or "evidence"
    "caller_identity": "DeepSynaps-Protocol-Studio"
}
```

### Rate Limits
- **Recommended:** 1 request per second
- **Batch queries:** Supported (use `\r`-separated identifiers)
- **No hard limit** but be respectful to the public server

### Sample Queries

```python
adapter = StringAdapter()

# Search for TP53 interactions in human
results = await adapter.search("TP53", filters={"species": 9606, "limit": 10})

# Search in mouse
results = await adapter.search("Trp53", filters={"species": 10090, "limit": 5})

# Get network image
image_bytes = await adapter.get_network_image(["TP53", "MDM2", "BRCA1"])

# Get protein info
info = await adapter.get_protein_info("TP53")
```

### Canonical Output Format
Transforms to `BiomarkerReading` (network) with:
- `entity_type`: "protein_interaction"
- `query_protein`, `species`, `species_name`
- `nodes` and `edges` from the interaction network
- `interactions` with all 7 evidence channel scores
- `top_enrichment_terms` from GO/KEGG enrichment

---

## 2. MyVariant.info Adapter (`myvariant_adapter.py`)

### Database Info
- **Name:** MyVariant.info
- **URL:** https://myvariant.info/v1/
- **Source:** UCSF/Scripps Research Institute
- **Data:** Aggregates 20+ variant databases (ClinVar, dbSNP, CADD, ExAC, gnomAD, etc.)
- **Confidence Tier:** A (multi-source aggregation)
- **Citation:** Xin J, et al. Genome Biology, 2016;17(1):1-7

### API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/variant/{id}` | GET | Single variant annotation lookup |
| `/v1/variant` | GET | Batch variant lookup (multiple IDs) |
| `/v1/query` | GET | Free-text query search |
| `/v1/metadata` | GET | Database metadata and statistics |

### Query ID Formats

| Format | Example |
|--------|---------|
| HGVS genomic | `chr1:g.218631822G>A` |
| HGVS coding | `NM_001301717.2:c.38C>A` |
| dbSNP rsid | `rs429358`, `rs6656401` |
| ClinGen CAID | `CA12345` |
| Gene name (via query) | `BRCA1`, `APOE` |

### Search Parameters

```python
{
    "fields": "all",          # Comma-separated fields or "all"
    "size": 10,               # Number of results (max 1000)
    "from_": 0,               # Pagination offset
    "assembly": "hg19",       # Genome assembly: "hg19" or "hg38"
    "scopes": None,           # Query scopes (e.g., "dbsnp.rsid")
}
```

### Rate Limits
- **Recommended:** 1 request per second
- **Batch API:** Up to 1000 variants per request
- **No authentication required**

### Aggregated Source Databases

| Source | Type | Key Fields |
|--------|------|------------|
| ClinVar | Clinical | `clinical_significance`, `rcv` |
| dbSNP | Identification | `rsid`, `alleles` |
| CADD | Prediction | `phred`, `rawscore` |
| dbNSFP | Prediction | `sift`, `polyphen2`, `MutationTaster` |
| gnomAD | Population | `af`, `af_afr`, `af_eas`, etc. |
| ExAC | Population | `af` |
| SnpEff | Annotation | `ann[].effect`, `ann[].genename` |

### Sample Queries

```python
adapter = MyVariantAdapter()

# Single variant lookup
results = await adapter.search("chr1:g.218631822G>A")

# By dbSNP rsid
results = await adapter.search("rs429358")

# Query by gene
results = await adapter.search("BRCA1", filters={"size": 20})

# Batch lookup
variants = await adapter.get_batch_variants(
    ["rs429358", "rs6656401", "rs7412"],
    fields="cadd.phred,dbsnp.rsid,clinvar.rcv"
)
```

### Canonical Output Format
Transforms to `BiomarkerReading` (variant_annotation) with:
- `entity_type`: "variant_annotation"
- `variant_id` (HGVS), `rsid`
- `coordinates`: chromosome, position, ref, alt, assembly
- `clinical_significance` from ClinVar
- `functional_scores`: CADD phred, SIFT, PolyPhen2
- `allele_frequencies`: gnomAD, ExAC
- `num_databases`: count of contributing sources

---

## 3. Yeo 2011 Atlas Adapter (`yeo2011_adapter.py`)

### Database Info
- **Name:** Yeo 2011 Functional Brain Parcellation
- **URL:** https://github.com/ThomasYeoLab/CBIG
- **Source:** Thomas Yeo Lab, Harvard/MGH
- **Data:** 7 and 17 functional resting-state networks
- **Confidence Tier:** A (HCP-based, 1000 subjects, highly cited)
- **Citation:** Yeo BT, et al. J Neurophysiol. 2011;106(3):1125-1165

### Atlas Characteristics

| Property | Value |
|----------|-------|
| Subjects | 1000 (HCP) |
| Surface space | fsaverage5/fsaverage6/fsaverage |
| Volume space | MNI152 |
| Available parcels | 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 |
| Network systems | 7-network, 17-network |

### 7-Network System

| ID | Name | Abbr | Key Regions |
|----|------|------|-------------|
| 1 | Visual | VIS | V1, V2, V3, V4, MT+, LOC |
| 2 | Somatomotor | SM | M1, S1, SMA, Precentral |
| 3 | Dorsal Attention | DA | IPS, FEF, SPL, MFG |
| 4 | Ventral Attention | VA | TPJ, VFC, STG, MTG |
| 5 | Limbic | LIM | Hippocampus, Amygdala, OFC |
| 6 | Frontoparietal | FP | LPFC, IPL, DLPFC, ACC |
| 7 | Default Mode | DMN | mPFC, PCC, Angular Gyrus, MTL |

### 17-Network System
Finer subdivision of the 7 networks (e.g., DMN -> DefaultA, DefaultB, DefaultC, TempPar).

### Search Parameters

```python
{
    "num_networks": 7,        # 7 or 17
    "hemisphere": "both",     # "LH", "RH", or "both"
    "network_id": None,       # Filter by specific network ID
    "include_parcels": True,  # Include parcel-level data
}
```

### Rate Limits
- N/A - File-based static atlas
- Built-in network data loaded from adapter code
- Optional: Download annotation files from GitHub

### Sample Queries

```python
adapter = Yeo2011Adapter()

# Search Default Mode Network (7-system)
results = await adapter.search("Default Mode", filters={"num_networks": 7})

# Search by abbreviation
results = await adapter.search("DMN")

# Search in 17-network system
results = await adapter.search("DMN_A", filters={"num_networks": 17})

# Search Visual network with parcels
results = await adapter.search("VIS", filters={"num_networks": 7, "include_parcels": True})

# Download full atlas files
downloaded = await adapter.download_atlas_files()
```

### Canonical Output Format
Transforms to `BiomarkerReading` (functional_network) with:
- `entity_type`: "functional_network"
- `network_id`, `network_name`, `network_abbreviation`
- `color_hex`, `description`
- `associated_regions`: list of anatomical regions
- `parcel_count` and sample parcels
- `atlas_type`: "resting_state_functional"

---

## 4. Gordon 2014 Atlas Adapter (`gordon2014_adapter.py`)

### Database Info
- **Name:** Gordon 2014 Cortical Parcellation
- **URL:** https://sites.wustl.edu/petersenersources/gordon-etal-2014-parcellation/
- **Source:** Steven Petersen Lab, Washington University in St. Louis
- **Data:** 333 cortical parcels in 13 functional networks
- **Confidence Tier:** A (resting-state based, well-validated)
- **Citation:** Gordon EM, et al. Cerebral Cortex. 2016;26(1):288-303

### Atlas Characteristics

| Property | Value |
|----------|-------|
| Subjects | 120 healthy young adults |
| Parcels | 333 cortical areas |
| Networks | 12 functional + 1 unassigned |
| Surface space | fsaverage4 |
| Volume space | MNI152 |

### 13 Network System

| ID | Name | Abbr | Description |
|----|------|------|-------------|
| 1 | Default Mode | DMN | Internally-directed cognition |
| 2 | Motor | MOT | Motor execution |
| 3 | Visual | VIS | Visual processing |
| 4 | Cingulo-Opercular | CON | Task-set maintenance |
| 5 | Dorsal Attention | DAN | Top-down attention |
| 6 | Fronto-Parietal | FPN | Cognitive control |
| 7 | Auditory | AUD | Auditory processing |
| 8 | Cerebellum | CB | Motor coordination |
| 9 | Ventral Attention | VAN | Bottom-up attention |
| 10 | Retrosplenial Temporal | RT | Scene/navigation |
| 11 | Parieto-Occipital | PON | Visuospatial |
| 12 | Salience | SAL | Interoceptive salience |
| 0 | Unassigned | None | Unassigned vertices |

### Search Parameters

```python
{
    "network_id": None,       # Filter by network ID (0-12)
    "hemisphere": "both",     # "LH", "RH", or "both"
    "include_parcels": True,  # Include parcel data
    "min_parcels": 0,         # Minimum parcel count
}
```

### Rate Limits
- N/A - File-based static atlas
- Built-in parcel data (333 parcels with MNI coordinates)

### Sample Queries

```python
adapter = Gordon2014Adapter()

# Search by network name
results = await adapter.search("Default Mode")

# Search by abbreviation
results = await adapter.search("FPN")

# Search by parcel number (1-333)
results = await adapter.search("150")

# Search by anatomical region
results = await adapter.search("Precentral")

# Search by hemisphere
results = await adapter.search("LH")
```

### Canonical Output Format
Transforms to `BiomarkerReading` with entity types:
- `functional_network` - for network-level results
- `cortical_parcel` - for single parcel results
- `hemisphere_parcels` - for hemisphere-level results

Includes:
- `network_id`, `network_name`, `network_abbreviation`
- `mni_coordinates` (x, y, z in MNI152 space)
- `hemisphere`, `color_hex`
- `num_parcels`, `associated_regions`

---

## 5. ADHD-200 Adapter (`adhd200_adapter.py`)

### Database Info
- **Name:** ADHD-200 Dataset
- **URL:** https://fcon_1000.projects.nitrc.org/indi/adhd200/
- **Source:** ADHD-200 Consortium / NITRC
- **Data:** 973 subjects with rs-fMRI + phenotypic data
- **Confidence Tier:** A (clinical phenotypes included, multi-site)
- **Citation:** ADHD-200 Consortium. Front Syst Neurosci. 2012;6:62

### Dataset Characteristics

| Property | Value |
|----------|-------|
| Total subjects | 973 |
| ADHD subjects | 776 |
| Control subjects | 197 |
| Sites | 8 international |
| Age range | 7.5 - 21.1 years |
| Modalities | T1-weighted MRI, rs-fMRI |
| Diagnosis | DSM-IV criteria |

### Acquisition Sites

| Code | Institution | Scanner |
|------|-------------|---------|
| KKI | Kennedy Krieger Institute | Philips 3T |
| NI | NeuroIMAGE (Netherlands) | Siemens/Philips 1.5T |
| NYU | NYU Child Study Center | Siemens 3T Allegra |
| OHSU | Oregon Health & Science | Siemens 3T |
| Peking | Peking University | Siemens 3T Trio |
| Pittsburgh | University of Pittsburgh | Siemens 3T |
| WashU | Washington University | Siemens 3T Tim-Trio |
| Brown | Brown University/Bradley | Siemens 3T |

### Phenotypic Variables

| Variable | Description |
|----------|-------------|
| `subject_id` | Unique subject identifier |
| `site` | Acquisition site code |
| `dx` | Diagnosis (0=Control, 1=ADHD) |
| `adhd_subtype` | 0=Control, 1=Combined, 2=Hyperactive-Impulsive, 3=Inattentive |
| `age` | Age in years |
| `sex` | 0=Female, 1=Male |
| `handedness` | 0=Right, 1=Left, 2=Ambidextrous |
| `medication` | 0=Off, 1=On |
| `verbal_iq` | Verbal IQ score |
| `performance_iq` | Performance IQ score |
| `full_iq` | Full-scale IQ |

### Search Parameters

```python
{
    "site": None,             # Site code filter
    "dx": None,               # Diagnosis (0=control, 1=ADHD)
    "adhd_subtype": None,     # Subtype (0-3)
    "age_min": None,          # Minimum age
    "age_max": None,          # Maximum age
    "sex": None,              # 0=female, 1=male
    "medication": None,       # 0=off, 1=on
    "max_results": 50,        # Max results to return
}
```

### Rate Limits
- N/A - Download-based dataset
- Phenotypic CSV can be cached locally
- Built-in fallback sample data (973 records)

### Sample Queries

```python
adapter = Adhd200Adapter()

# Search by site
results = await adapter.search("NYU", filters={"max_results": 10})

# Search ADHD subjects
results = await adapter.search("ADHD", filters={"max_results": 20})

# Search controls
results = await adapter.search("control", filters={"max_results": 20})

# Filtered search: combined ADHD, ages 10-15
results = await adapter.search("*", filters={
    "dx": 1, "adhd_subtype": 1,
    "age_min": 10, "age_max": 15,
    "max_results": 30
})

# Get full dataset summary
summary = await adapter.get_dataset_summary()
```

### Canonical Output Format
Transforms to `BiomarkerReading` (clinical_subject) with:
- `entity_type`: "clinical_subject"
- `subject_id`, `site`, `site_full_name`
- `diagnosis`, `adhd_subtype`
- `age`, `age_group`, `sex`, `handedness`
- `medication_status`
- `verbal_iq`, `performance_iq`, `full_iq`
- `clinical_notes`: auto-generated clinical summary

---

## Error Handling

All adapters implement consistent error handling:

| Error Type | Handling |
|------------|----------|
| HTTP timeout | Logged, returns empty results / False |
| HTTP 4xx/5xx | Logged with status code, returns empty results |
| Connection error | Logged, returns cached data if available |
| JSON parse error | Logged, returns empty results |
| Rate limiting | Automatic request spacing (1 req/sec for API adapters) |

## Cache Configuration

| Adapter | Cache Location | Content |
|---------|---------------|---------|
| STRING | `~/.cache/deepsynaps/string/` | Network images |
| MyVariant.info | N/A (live queries) | N/A |
| Yeo 2011 | `~/.cache/deepsynaps/yeo2011/` | Atlas annotation files |
| Gordon 2014 | `~/.cache/deepsynaps/gordon2014/` | Parcel files |
| ADHD-200 | `~/.cache/deepsynaps/adhd200/` | Phenotypic CSV |

## Testing Summary

| Test Class | Tests | Coverage |
|------------|-------|----------|
| `TestStringAdapter` | 7 tests | Init, validation, search, transform, provenance, confidence, species mapping |
| `TestMyVariantAdapter` | 7 tests | Init, validation, variant lookup, query search, transform, variant ID detection, source counting |
| `TestYeo2011Adapter` | 9 tests | Init, validation, builtin loading, search by name/abbr/ID, 17-network, parcels, transform, provenance |
| `TestGordon2014Adapter` | 9 tests | Init, validation, search by name/abbr/parcel/region/hemisphere, network/parcel transform, provenance |
| `TestAdhd200Adapter` | 13 tests | Init, validation, builtin data, search by site/dx/control/filters/sex, transform, age groups, clinical notes, summary, CSV parsing |
| `TestBatch5Integration` | 5 tests | All init, validation, provenance, confidence, canonical transforms |

**Total: 50 tests**

## Files Generated

```
/mnt/agents/output/batch5/
├── string_adapter.py              # STRING PPI adapter
├── myvariant_adapter.py           # MyVariant.info adapter
├── yeo2011_adapter.py             # Yeo 2011 Atlas adapter
├── gordon2014_adapter.py          # Gordon 2014 Atlas adapter
├── adhd200_adapter.py             # ADHD-200 dataset adapter
├── test_batch5_atlas.py           # 50 tests across all adapters
└── BATCH5_ATLAS_INTEGRATION_REPORT.md   # This report
```
