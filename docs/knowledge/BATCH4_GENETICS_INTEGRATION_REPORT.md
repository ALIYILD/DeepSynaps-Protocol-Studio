# Batch 4 Genetics Database Integration Report

## Overview

This report documents the integration of 5 P0 (priority 0) free/open genetics database adapters built for the DeepSynaps Protocol Studio. All adapters follow the standardized BaseAdapter pattern with full FastAPI compatibility.

| Adapter | Database | Records | API Type | Auth |
|---------|----------|---------|----------|------|
| GwasCatalogAdapter | GWAS Catalog (EMBL-EBI) | 500K+ associations | REST (HAL) | None |
| DbsnpAdapter | dbSNP (NCBI) | 600M+ SNPs | E-utilities | Optional API key |
| EnsemblAdapter | Ensembl (EMBL-EBI) | 200+ species | REST | Optional key |
| GnomadAdapter | gnomAD (Broad Institute) | 807K+ exomes | GraphQL | None |
| UniprotAdapter | UniProt Consortium | 250M+ proteins | REST | None |

---

## 1. GWAS Catalog Adapter (`gwas_catalog_adapter.py`)

### API Details
- **Base URL**: `https://www.ebi.ac.uk/gwas/rest/api/`
- **Documentation**: https://www.ebi.ac.uk/gwas/rest/docs/api
- **Data Source**: EMBL-EBI, fully open
- **Confidence Tier**: A (peer-reviewed curated associations)
- **Rate Limit**: ~15 requests/second (900/min)
- **Authentication**: None required
- **Response Format**: HAL JSON (`_embedded`, `_links`)

### Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /studies` | Validate connection, search studies |
| `GET /associations/search` | Search associations (primary) |
| `GET /singleNucleotidePolymorphisms/{rsid}` | SNP metadata |
| `GET /singleNucleotidePolymorphisms/{rsid}/associations` | SNP associations |
| `GET /efoTraits/search` | Trait/ontology lookup |

### Search Types
- `trait` — Search by EFO trait term (e.g., "type 2 diabetes")
- `gene` — Search by reported gene symbol (e.g., "TCF7L2")
- `snp` — Search by rsID (e.g., "rs7903146")
- `association` — Full-text search across associations
- `study` — Search by study accession or keyword

### Filter Parameters
```python
{
    "search_type": "trait",      # trait|gene|snp|association|study
    "pvalue_max": 5e-8,          # P-value ceiling filter
    "size": 20,                  # Page size (max 20)
    "page": 0,                   # Page number
}
```

### Sample Queries
```python
from gwas_catalog_adapter import GwasCatalogAdapter

adapter = GwasCatalogAdapter()

# Search for T2D associations
results = await adapter.search("diabetes", {"search_type": "trait", "pvalue_max": 5e-8})

# Search by gene
results = await adapter.search("BRCA1", {"search_type": "gene"})

# Search by SNP
results = await adapter.search("rs7903146", {"search_type": "snp"})
```

### Canonical Transformation
Associations are transformed to `genetic_variant` canonical form with GWAS-specific extensions:
- `pvalue`, `effect_size` (OR), `beta`
- `traits` (list of mapped EFO traits)
- `risk_allele_frequency`
- `association_description`

### Confidence Scoring
Weights: p-value (35%), replication (25%), effect size (20%), curation (20%)
- p < 5e-8: evidence_strength = 1.0
- p < 1e-5: evidence_strength = 0.85
- p < 0.05: evidence_strength = 0.6

---

## 2. dbSNP Adapter (`dbsnp_adapter.py`)

### API Details
- **Base URL**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- **Documentation**: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- **Data Source**: NCBI, fully open (US Government Work)
- **Confidence Tier**: A (NCBI reference database)
- **Rate Limit**: 3 req/s (no key), 10 req/s (with API key)
- **Authentication**: Optional API key for higher rate limits
- **Response Format**: JSON via `retmode=json`

### Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET esearch.fcgi` | Search SNP IDs by term |
| `GET esummary.fcgi` | Fetch SNP summaries |
| `GET efetch.fcgi` | Detailed SNP records |

### Search Types
- `rsid` — Direct lookup by rsID (e.g., "rs6025")
- `gene` — Search by gene symbol (e.g., "F5")
- `region` — Search by chromosomal region (e.g., "1:1000000-1100000")
- `clinical` — Clinically significant variants only

### Filter Parameters
```python
{
    "search_type": "rsid",       # rsid|gene|region|clinical|auto
    "retmax": 20,                # Max results (max 500)
    "variant_class": "snv",      # Filter by variant class
    "organism": "human",         # Organism filter
}
```

### Sample Queries
```python
from dbsnp_adapter import DbsnpAdapter

adapter = DbsnpAdapter(api_key="YOUR_NCBI_KEY")  # Optional

# Lookup rsID
results = await adapter.search("rs6025", {"search_type": "rsid"})

# Search by gene
results = await adapter.search("BRCA1", {"search_type": "gene", "retmax": 50})

# Region search
results = await adapter.search("13:32315000-32400000", {"search_type": "region"})
```

### Canonical Transformation
SNP entries transformed to `genetic_variant` with dbSNP extensions:
- `snp_class` mapped to standardized variant type (SNV, indel, deletion, etc.)
- `ref_allele` / `alt_alleles` with frequencies
- `clinical_significance`
- `build_id` (dbSNP build version)
- `weight` (validation status)

### Confidence Scoring
Weights: reference quality (40%), validation weight (20%), clinical annotation (20%), gene mapping (20%)
- Baseline data_quality: 0.97 (NCBI reference)

---

## 3. Ensembl Adapter (`ensembl_adapter.py`)

### API Details
- **Base URL**: `https://rest.ensembl.org/`
- **Documentation**: https://rest.ensembl.org/documentation/info
- **Data Source**: EMBL-EBI, fully open
- **Confidence Tier**: A (reference genome annotations)
- **Rate Limit**: 15 req/s (slow), 55 req/s (with key)
- **Authentication**: Optional API key for higher rate limits
- **Response Format**: JSON

### Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /info/ping` | Validate connection |
| `GET /lookup/symbol/{species}/{symbol}` | Gene lookup by symbol |
| `GET /lookup/id/{id}` | ID lookup (ENSG/ENST/ENSP) |
| `GET /overlap/region/{species}/{region}` | Region overlap query |
| `GET /variation/{species}/{variant}` | Variant lookup |
| `GET /sequence/id/{id}` | Sequence retrieval |
| `GET /xrefs/id/{id}` | External references |

### Search Types
- `gene` — Gene symbol lookup (e.g., "BRCA2")
- `ens_id` — Ensembl ID lookup (e.g., "ENSG00000139618")
- `region` — Genomic region overlap (e.g., "1:1000000-1100000")
- `variant` — Variant by rsID or Ensembl variant ID

### Filter Parameters
```python
{
    "search_type": "gene",       # gene|ens_id|region|variant|auto
    "species": "homo_sapiens",   # Species (default human)
    "expand": False,             # Include transcripts
    "feature_type": "gene",      # For region queries
}
```

### Sample Queries
```python
from ensembl_adapter import EnsemblAdapter

adapter = EnsemblAdapter()

# Gene lookup
results = await adapter.search("BRCA2", {"search_type": "gene", "expand": True})

# Ensembl ID lookup
results = await adapter.search("ENSG00000139618", {"search_type": "ens_id"})

# Region overlap
results = await adapter.search("13:32315000-32400000", {"search_type": "region"})

# Variant lookup
results = await adapter.search("rs80359752", {"search_type": "variant"})
```

### Canonical Transformation
Gene entries transformed to `gene` canonical form with Ensembl extensions:
- `ensembl_id`, `object_type`, `biotype`
- `transcript_ids` and `transcript_count`
- `assembly`, `strand`, `start`, `end`
- `is_reference` flag

### Confidence Scoring
Weights: reference quality (35%), transcripts (25%), HGNC symbol (20%), biotype (20%)
- Trusted biotypes (protein_coding, lncRNA, miRNA): biotype_score = 0.95
- Reference genome entries: data_quality = 0.98

---

## 4. gnomAD Adapter (`gnomad_adapter.py`)

### API Details
- **Base URL**: `https://gnomad.broadinstitute.org/api/`
- **Documentation**: https://gnomad.broadinstitute.org/api/
- **Data Source**: Broad Institute, open access
- **Confidence Tier**: A (population-scale sequencing)
- **Rate Limit**: ~10 req/s (reasonable use policy)
- **Authentication**: None required
- **Response Format**: GraphQL JSON

### GraphQL Queries
| Query | Purpose |
|---------|---------|
| `{ meta { gnomad_version } }` | Validate connection |
| `query GeneVariants` | Variants in a gene |
| `query VariantQuery` | Specific variant lookup |
| `query RegionVariants` | Variants in a region |
| `query RsidSearch` | Search by rsID |
| `query GeneConstraint` | Gene constraint metrics (pLI, LOEUF) |

### Search Types
- `gene` — Variants by gene symbol (e.g., "BRCA2")
- `variant` — Specific variant by chrom-pos-ref-alt (e.g., "1-55039959-G-A")
- `region` — Variants in genomic region (e.g., "13:32315000-32400000")
- `rsid` — Search by rsID (e.g., "rs1801133")

### Filter Parameters
```python
{
    "search_type": "gene",       # gene|variant|region|rsid|auto
    "dataset": "gnomad_r4",      # Dataset version
    "include_exome": True,       # Include exome frequencies
    "include_genome": True,      # Include genome frequencies
}
```

### Sample Queries
```python
from gnomad_adapter import GnomadAdapter

adapter = GnomadAdapter()

# Gene variant query
results = await adapter.search("BRCA2", {"search_type": "gene"})

# Specific variant
results = await adapter.search("1-55039959-G-A", {"search_type": "variant"})

# Gene constraint metrics
constraint = await adapter.get_gene_constraint("BRCA2")
# Returns: pLI, LOEUF, observed/expected LoF, missense Z-score
```

### Canonical Transformation
Variants transformed to `genetic_variant` with gnomAD-specific extensions:
- `variant_id` (chrom-pos-ref-alt format)
- `allele_frequency`: exome, genome, joint with AC/AN
- `population_frequencies`: per-ancestry AFs
- `hgvsc`, `hgvsp` (HGVS annotations)
- `loftee_prediction` (LoF prediction)
- `flags` (quality flags)

### Confidence Scoring
Weights: reference quality (25%), sample size (30%), observed (15%), flags (15%), population diversity (15%)
- AN > 1M: sample_size = 1.0
- No flags: consistency = 1.0
- 8+ populations: population_match = 1.0

---

## 5. UniProt Adapter (`uniprot_adapter.py`)

### API Details
- **Base URL**: `https://rest.uniprot.org/`
- **Documentation**: https://rest.uniprot.org/docs/
- **Data Source**: UniProt Consortium, fully open
- **Confidence Tier**: A (Swiss-Prot manually curated)
- **Rate Limit**: ~1 req/s (polite), batch queries supported
- **Authentication**: None required
- **Response Format**: JSON

### Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /uniprotkb/search` | Search protein entries |
| `GET /uniprotkb/{accession}` | Entry by accession |
| `POST /idmapping/run` | ID mapping between databases |
| `GET /idmapping/results/{jobId}` | ID mapping results |

### Search Types
- `protein` — Protein name/keyword search
- `gene` — Search by gene symbol
- `accession` — Direct accession lookup (e.g., "P04637")
- `go` — Search by GO term (e.g., "GO:0006355")

### Filter Parameters
```python
{
    "search_type": "protein",    # protein|gene|accession|go|auto
    "reviewed_only": False,      # Swiss-Prot only
    "organism": "human",         # Organism filter
    "size": 25,                  # Result page size (max 25)
    "fields": [],                # Specific fields to return
}
```

### Sample Queries
```python
from uniprot_adapter import UniprotAdapter

adapter = UniprotAdapter()

# Search by accession
results = await adapter.search("P04637", {"search_type": "accession"})

# Search by gene
results = await adapter.search("TP53", {"search_type": "gene", "reviewed_only": True})

# Search by GO term
results = await adapter.search("GO:0006355", {"search_type": "go"})

# ID mapping (UniProt -> GeneID)
mappings = await adapter.id_mapping(
    ["P04637", "P06400"],
    from_db="UniProtKB_AC-ID",
    to_db="GeneID"
)
```

### Canonical Transformation
Protein entries transformed to `protein` canonical form with UniProt extensions:
- `accession`, `uniprot_id`, `entry_type`
- `is_reviewed` (Swiss-Prot vs TrEMBL distinction)
- `protein_name`, `alternative_names`
- `gene_names`, `organism`, `taxon_id`
- `sequence_length`, `sequence_molecular_weight`
- `function_descriptions`, `keywords`
- `go_terms` (parsed from cross-references)
- `variant_count` (natural variants)

### Confidence Scoring
Weights: curation (40%), evidence (20%), function (15%), GO terms (10%), structure (10%), baseline (5%)
- Swiss-Prot: data_quality = 0.99, overall > 0.9
- TrEMBL: data_quality = 0.7, overall < 0.85

---

## Rate Limiting Summary

| Adapter | Default Rate | With Key | Throttle Strategy |
|---------|-------------|----------|-------------------|
| GWAS Catalog | 15 req/s | 15 req/s | Async interval throttle |
| dbSNP | 3 req/s | 10 req/s | Configurable by API key |
| Ensembl | 15 req/s | 55 req/s | Configurable by API key |
| gnomAD | 10 req/s | 10 req/s | Fixed 10 req/s |
| UniProt | 1 req/s | 1 req/s | Polite 1 req/s |

All adapters use `asyncio`-based throttling via `_throttled_request()` to ensure compliance.

---

## Confidence Tier Justification

All 5 databases receive **Tier A** confidence:

| Database | Justification |
|----------|--------------|
| GWAS Catalog | Peer-reviewed, manually curated from published GWAS. Every association has a PubMed citation. |
| dbSNP | NCBI reference database. Central repository for human genetic variation. US Government maintained. |
| Ensembl | Reference genome annotation from EMBL-EBI. Gold-standard gene/transcript annotations for GRCh38. |
| gnomAD | Population-scale sequencing (807K+ exomes). Standard reference for allele frequency interpretation. |
| UniProt | Swiss-Prot entries are manually curated by expert biologists. Functional annotations are experimentally verified. |

---

## Error Handling Strategy

All adapters implement consistent error handling:
1. **HTTP errors**: Caught via `httpx.HTTPError`, logged, return empty list
2. **Timeout errors**: 30s default timeout, connection validation uses 10-15s
3. **GraphQL errors**: gnomAD adapter checks for `errors` key in response
4. **404 Not Found**: Returns empty list (not an error for search)
5. **Rate limiting**: Built-in async throttling prevents hitting limits
6. **Logging**: All errors logged via `logging.getLogger(__name__)`

---

## Context Manager Support

All adapters support async context managers:

```python
async with GwasCatalogAdapter() as adapter:
    results = await adapter.search("diabetes")
    canonical = adapter.transform_to_canonical(results[0])
# Client auto-closed on exit
```

---

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `gwas_catalog_adapter.py` | ~370 | GWAS Catalog REST adapter |
| `dbsnp_adapter.py` | ~380 | dbSNP E-utilities adapter |
| `ensembl_adapter.py` | ~380 | Ensembl REST adapter |
| `gnomad_adapter.py` | ~420 | gnomAD GraphQL adapter |
| `uniprot_adapter.py` | ~430 | UniProt REST adapter |
| `test_batch4_genetics.py` | ~620 | Comprehensive test suite |
| `BATCH4_GENETICS_INTEGRATION_REPORT.md` | This file | Documentation |

---

*Generated for DeepSynaps Protocol Studio — Batch 4 of 6*
*Date: 2024*
