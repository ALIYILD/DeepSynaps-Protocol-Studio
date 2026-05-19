# Knowledge-adapter roadmap — 2026-05-18

**Status:** Planning document. Lists every biomedical database known to the
Knowledge Layer effort and where each one stands relative to production.

This roadmap is the source-of-truth for the rebuild that follows from the
[salvage notes](./kimi-knowledge-salvage-notes.md). It is intentionally
short on prose and heavy on tables: it exists so each adapter PR has a
single place to update its row.

## Layout

| Term | Meaning |
|---|---|
| **Prod path** | The canonical target for every production adapter: `apps/api/app/services/knowledge/adapters/<name>_adapter.py` |
| **Test path** | `apps/api/tests/test_<name>_adapter.py` (matches existing pattern: `test_openmed_adapter.py`, `test_sendgrid_adapter_launch_audit.py`) |
| **Base** | All adapters subclass `DatabaseAdapter(ABC)` from `app.services.knowledge.base_adapter` |
| **Registry** | Register at startup with `AdapterRegistry().register(<key>, <instance>, tier="P0"\|"P1"\|"P2")` from `app.services.knowledge.adapter_registry` |
| **Briefing** | The relevant section in `docs/knowledge/BATCH{1..6}_*INTEGRATION_REPORT.md` — contains endpoints, sample queries, response shapes, evidence-grade mappings |
| **Kimi ref** | The corresponding file in `apps/api/app/knowledge/<name>_adapter.py` — **reference only, do not import** |

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Already in production at the prod path. Working, imported, tested |
| 📋 | Briefed by Kimi research, ready to implement against the production ABC |
| 🚧 | Needs additional research — Kimi file exists but has no `self.name` set, suggesting truncated chat output |
| 🔄 | Newly catalogued from external source (operator-supplied), briefing pending |
| ⏳ | Out of scope for current roadmap (licensed, restricted, web-scrape only) |

---

## 1. Currently in production (16 adapters)

All located at `apps/api/app/services/knowledge/adapters/` and imported by 9
production files. **Do not duplicate.** These are the working baseline.

| Status | Name | Category | File |
|---|---|---|---|
| ✅ | RxNorm | Pharma | `rxnorm_adapter.py` |
| ✅ | PharmGKB | Genetics / Pharma | `pharmgkb_adapter.py` |
| ✅ | ClinVar | Genetics | `clinvar_adapter.py` |
| ✅ | LOINC | Terminology | `loinc_adapter.py` |
| ✅ | openFDA | Pharma / AE | `openfda_adapter.py` |
| ✅ | FAERS | Adverse events | `faers_adapter.py` |
| ✅ | OnSIDES | Adverse events | `onsides_adapter.py` |
| ✅ | CHBMP | qEEG / atlas | `chbmp_adapter.py` |
| ✅ | MNI Atlas | Brain atlas | `mni_atlas_adapter.py` |
| ✅ | Schaefer 2018 | Brain atlas | `schaefer_adapter.py` |
| ✅ | Neurosynth | Neuroimaging meta-analysis | `neurosynth_adapter.py` |
| ✅ | Allen Brain | Neuroimaging | `allen_brain_adapter.py` |
| ✅ | ADNI | Neuroimaging cohort | `adni_adapter.py` |
| ✅ | ABIDE | Neuroimaging cohort | `abide_adapter.py` |
| ✅ | PROMIS | Outcomes | `promis_adapter.py` |
| ✅ | SimNIBS | Simulation | `simnibs_adapter.py` |

## 2. Ready to implement — Batch 1 (first proof-of-concept)

These three are the recommended initial PR set. All open, no auth, well-documented APIs. Implementing this batch validates the re-implementation pattern end-to-end (real ABC → real registry → real test → CI green) before scaling out.

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 1 | PubMed / E-utilities | BATCH3 § 1 | `apps/api/app/knowledge/pubmed_adapter.py` | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` | B | 3/s (no key), 10/s (with key) | Optional |
| 2 | ClinicalTrials.gov v2 | BATCH3 § 3 | `apps/api/app/knowledge/clinicaltrials_adapter.py` | `https://clinicaltrials.gov/api/v2/` | A | ~1/s | None |
| 3 | gnomAD | BATCH4 § 4 | `apps/api/app/knowledge/gnomad_adapter.py` | `https://gnomad.broadinstitute.org/api/` | A | reasonable-use | None |

## 3. Ready to implement — Batch 2 (literature/evidence)

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 4 | Europe PMC | BATCH3 § 4 | `europepmc_adapter.py` | `https://www.ebi.ac.uk/europepmc/webservices/rest/` | B | ~1000/min | None |
| 5 | Cochrane Library | BATCH3 § 2 | `cochrane_adapter.py` | `https://www.cochranelibrary.com/` + `https://export.cochrane.org/` | A | ~2/s | None |
| 6 | NICE Evidence | BATCH3 § 5 | `nice_adapter.py` | `https://www.nice.org.uk/guidance` | A | ~2/s | None |
| 7 | Semantic Scholar | BATCH6 § 1 | `semantic_scholar_adapter.py` | `https://api.semanticscholar.org/graph/v1/` | B | 100 / 5 min | None |
| 8 | bioRxiv / medRxiv | BATCH4 (Phase 4) | `biorxiv_adapter.py` | `https://api.biorxiv.org/` | C | 60/min | None |

## 4. Ready to implement — Batch 3 (pharma / terminology)

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 9 | ChEMBL | BATCH2 § 2 | `chembl_adapter.py` | `https://www.ebi.ac.uk/chembl/api/data/` | A | 900/min | None |
| 10 | PubChem | BATCH2 § 3 | `pubchem_adapter.py` | `https://pubchem.ncbi.nlm.nih.gov/rest/pug/` | A | 300/min | None |
| 11 | DailyMed | BATCH2 § 4 | `dailymed_adapter.py` | `https://dailymed.nlm.nih.gov/dailymed/` | A | 600/min | None |
| 12 | SNOMED CT | BATCH2 § 5 | `snomedct_adapter.py` | `https://browser.ihtsdotools.org/` | A | 300/min | None* (Snowstorm API) |
| 13 | DrugBank | BATCH2 § 1 | `drugbank_adapter.py` | `https://go.drugbank.com/` | A | 180/min | **Yes** (academic key) |

\* SNOMED CT terminology is licensed; the public Snowstorm API exposes a research-permissible subset.

## 5. Ready to implement — Batch 4 (genetics)

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 14 | GWAS Catalog | BATCH4 § 1 | `gwas_catalog_adapter.py` | `https://www.ebi.ac.uk/gwas/rest/api/` | A | 900/min | None |
| 15 | dbSNP | BATCH4 § 2 | `dbsnp_adapter.py` | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` | A | 600/min | Optional |
| 16 | Ensembl | BATCH4 § 3 | `ensembl_adapter.py` | `https://rest.ensembl.org/` | A | 3300/min (with key) | Optional |
| 17 | UniProt | BATCH4 § 5 | `uniprot_adapter.py` | `https://rest.uniprot.org/` | A | 60/min | None |
| 18 | STRING | BATCH5 § 1 | `string_adapter.py` | `https://string-db.org/api/` | A | 60/min | None |
| 19 | MyVariant.info | BATCH5 § 2 | `myvariant_adapter.py` | `https://myvariant.info/v1/` | A | 60/min | None |

## 6. Ready to implement — Batch 5 (neuroimaging atlas / cohort)

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 20 | NeuroVault | BATCH1 § 1 | `neurovault_adapter.py` | `https://neurovault.org/api/` | B | 100/min | None |
| 21 | OpenNeuro | BATCH1 § 3 | `openneuro_adapter.py` | `https://openneuro.org/` (GraphQL) | B | 60/min | None |
| 22 | OASIS | BATCH1 § 4 | `oasis_adapter.py` | `https://www.oasis-brains.org/` | A | 60/min | **Yes** (registration) |
| 23 | HCP | BATCH1 § 2 | `hcp_adapter.py` | `https://db.humanconnectome.org/` | A | 60/min | **Yes** (registration) |
| 24 | HCP Aging | BATCH1 § 5 | `hcp_aging_adapter.py` | `https://www.humanconnectome.org/study/hcp-lifespan-aging` | A | 60/min | **Yes** (registration) |
| 25 | Yeo 2011 | BATCH5 § 3 | `yeo2011_adapter.py` | atlas download | A | n/a (file-based) | None |
| 26 | Gordon 2014 | BATCH5 § 4 | `gordon2014_adapter.py` | atlas download | A | n/a | None |
| 27 | Brainnetome | Phase 4 batch_a | `brainnetome_adapter.py` | `http://atlas.brainnetome.org/` | A | n/a | None |
| 28 | 1000 Functional Connectomes | Phase 4 batch_a | `functional_connectomes_1000_adapter.py` | `https://fcon_1000.projects.nitrc.org/` | A | n/a | None |
| 29 | NITRC | Phase 4 batch_a | `nitrc_adapter.py` | `https://www.nitrc.org/` | B | 60/min | None |
| 30 | ADHD-200 | BATCH5 § 5 | `adhd200_adapter.py` | `https://fcon_1000.projects.nitrc.org/indi/adhd200/` | A | n/a | None |
| 31 | IXI | Phase 4 batch_a | `ixi_adapter.py` | `https://brain-development.org/ixi-dataset/` | A | n/a | None |
| 32 | Glasser 2016 | Phase 4 batch_a | `glasser2016_adapter.py` | `https://balsa.wustl.edu/VvA7` | A | n/a | None |

## 7. Ready to implement — Batch 6 (evidence / preventive / preprint)

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 33 | AHRQ ePSS | Phase 4 batch_d | `ahrq_epss_adapter.py` | `https://epss.ahrq.gov/` | A | 120/min | None |
| 34 | Epistemonikos | Phase 4 batch_d | `epistemonikos_adapter.py` | epistemonikos.org | A | 120/min | **Yes** (free key) |
| 35 | NIH RePORTER | Phase 4 batch_d | `nih_reporter_adapter.py` | `https://api.reporter.nih.gov/` | B | 120/min | None |
| 36 | CORE | Phase 4 batch_d | `core_adapter.py` | `https://api.core.ac.uk/` | B | 120/min | **Yes** (free key) |
| 37 | TRIP Database | Phase 4 batch_c | `trip_database_adapter.py` | tripdatabase.com | B | 120/min | **Yes** (partner) |

## 8. Adverse event — Batch 7

| # | Database | Briefing | Kimi ref | Source URL | Tier | Rate limit | Auth |
|---|---|---|---|---|---|---|---|
| 38 | AEOLUS | BATCH6 § 2 | `aeolus_adapter.py` | dryad.org dataset | B | 10/min | None |
| 39 | SIDER | BATCH6 § 3 | `sider_adapter.py` | `http://sideeffects.embl.de/` | B | 10/min | None |
| 40 | OFFSIDES / TWOSIDES | BATCH6 § 4 | `offsides_twosides_adapter.py` | tatonetti-lab/onsides | B | 10/min | None |

All three are **research-only** by license — production records they
generate must have `research_only=True` in their `ProvenanceRecord`.

## 9. Needs additional research before re-implementation

These Kimi files exist but have no `self.name` set, suggesting Kimi's chat
truncated mid-response. Each must be re-researched from primary sources
(or the BATCH report) before implementation.

| # | Database | Kimi ref | What's missing |
|---|---|---|---|
| 41 | COBRE | `cobre_adapter.py` | No metadata in file |
| 42 | CORR | `corr_adapter.py` | No metadata in file |
| 43 | ds030 | `ds030_adapter.py` | No metadata in file |
| 44 | GSP | `gsp_adapter.py` | No metadata in file |
| 45 | HCP Lifespan | `hcp_lifespan_adapter.py` | No metadata in file |
| 46 | NDC Directory | `ndc_directory_adapter.py` | No metadata in file |
| 47 | Orange Book | `orange_book_adapter.py` | No metadata in file |
| 48 | OTseeker | `otseeker_adapter.py` | No metadata in file |
| 49 | PEDro | `pedro_adapter.py` | No metadata in file |
| 50 | UNII | `unii_adapter.py` | No metadata in file |

## 10. Category 11 — Literature aggregators (added 2026-05-19)

Operator-supplied entries from an external numbered catalog (`#87`–`#90`,
"Category 11: LITERATURE"). Two of the four are already tracked elsewhere
in this doc; the other two are net-new to the roadmap.

| # | Database | Status | Access | API Endpoint | Clinical use | In-doc cross-ref |
|---|---|---|---|---|---|---|
| 87 | Semantic Scholar | 📋 | Free | `https://api.semanticscholar.org/graph/v1/` | AI-powered literature search; rank by citation velocity for rare-condition neuromodulation queries | **Already at Batch 2 row #7** — implementation pending |
| 88 | OpenAlex | 📋 | Free API key + $1/day usage credit | `https://api.openalex.org/` | Open scholarly graph; citation analysis, author/affiliation networks for evidence triangulation | Briefed 2026-05-19 — see § 10.1 below |
| 89 | Dimensions | ⚠️ 🔄 | Subscription / by-application; no public REST | DSL endpoint (Dimensions Search Language v2.15.0) | Research analytics + funding data | Briefed 2026-05-19 — **license restriction likely blocks our use case**; see § 10.2 below |
| 90 | CORE | 📋 | Free | `https://api.core.ac.uk/v3/` | Open-access full-text aggregation; full-text retrieval for systematic reviews | **Already at Batch 6 row #36** — implementation pending |

**Net-new additions to total addressable:** 2 (OpenAlex, Dimensions). Total now **52 catalogued** + 16 already in production = **68** distinct knowledge sources once the roadmap is complete.

The two existing entries (Semantic Scholar #87, CORE #90) do not need
duplicate work — they are already in earlier batches with full briefings
in the corresponding BATCH reports.

### § 10.1 OpenAlex (#88) — briefing 2026-05-19

| Field | Value |
|---|---|
| Base URL | `https://api.openalex.org` |
| Auth | **API key required.** Free key at `https://openalex.org/settings/api`. Sent as a query parameter. |
| Pricing | Free tier = **$1/day usage credit** (usage-based, different ops cost different amounts). Higher limits and bulk snapshots require a paid plan (`https://openalex.org/pricing`). |
| Rate limit | Not published as a fixed req/sec. Throttled via the daily credit pool. |
| Entities (22) | Primary: `/works`, `/authors`, `/sources`, `/institutions`, `/topics`, `/keywords`, `/publishers`, `/funders`, `/awards`. Auxiliary: `/domains`, `/fields`, `/subfields`, `/sdgs`, `/countries`, `/continents`, `/languages`, `/work-types`, `/source-types`, `/institution-types`, `/licenses`, `/concepts` (legacy). |
| External ID lookup | DOI, ORCID, ROR, PMID |
| Pagination | `page` (offset-style, max 100/page) **or** `cursor` (recommended for >10 000 results) |
| Response shape | `{ meta: {count, page, per_page, response_time_ms}, results: [...], group_by: ... }` |
| Filtering | Rich filter DSL (e.g., `is_oa:true,cited_by_count:>50`); `select=…` for field projection; `group_by=…` for aggregation |
| Data license | **CC0 1.0** — clean, permissive, suitable for re-distribution and derivative use |
| Status change | Previous "polite pool with mailto" no-auth model **is gone** — every adapter implementation needs the API-key path. |

**Implementation notes for the eventual adapter PR:**
- Subclass `DatabaseAdapter` per the standard ABC. Config: `{api_key: str, base_url: str = "https://api.openalex.org"}`.
- `fetch` should default to `/works?search=<term>&select=id,doi,title,publication_year,cited_by_count,open_access,authorships,concepts,abstract_inverted_index&per-page=25` and use cursor pagination.
- `_evidence_level` should derive from work type + citation count (peer-reviewed vs preprint vs dataset).
- `_confidence` can use `cited_by_count` and `is_oa` as input signals.
- Cost-tracking: log per-request cost (returned in response headers when available) so the adapter can warn at, say, 80% of daily credit.

### § 10.2 Dimensions (#89) — briefing 2026-05-19 ⚠️

| Field | Value |
|---|---|
| Base URL | Not a standard REST endpoint. Access via DSL (Dimensions Search Language) v2.15.0. |
| Auth | **Institutional subscription** primary access. **Free tier exists** for "eligible scientometric research projects" via Digital Science. No public free REST endpoint. |
| Pricing | Not publicly documented; subscription model |
| Rate limit | Not publicly documented |
| Queryable sources | Publications, Grants, Patents, Clinical Trials, Policy Documents, Datasets, Source Titles, Reports, Researchers, Organizations, Funder Groups, Research Org Groups |
| Query language | Dimensions Search Language (DSL) — proprietary, not standard REST/GraphQL |
| **License restriction** | **Explicit:** *"The Dimensions Analytics API is not intended for bulk data or to power dashboards or other derivative products."* The API is positioned for "complex analytical tasks". |

**Operator decision required before implementation:**

The license clause above is the central concern. The DeepSynaps Knowledge Layer is, by design, a derivative product that surfaces ranked external evidence to clinicians via a dashboard-style UI — exactly the use case Dimensions excludes.

Three plausible paths:

1. **Drop from roadmap.** Change status from 🔄 to ⏳ (out of scope) with the license clause as the rationale. Recommended unless (2) or (3) applies.
2. **Negotiate a commercial license** that permits the derivative-product use case. Requires sales conversation with Digital Science. Out of scope for engineering.
3. **Re-scope the integration** to a query-time analytical lookup (e.g., a clinician-initiated "show me funded research programs for this rare condition" tab) that may fall under the permitted "complex analytical tasks" umbrella. Requires legal review of the use case before implementation.

This briefing **does not advance the status to 📋**. The 🔄 + ⚠️ markers remain until the operator selects a path.

---

## How to implement a row from this table

Every row goes through the same pipeline; treating it as a checklist keeps
implementations consistent and avoids the "parallel codebase" mistake.

1. Read the **Briefing** column's BATCH report section. That's your spec.
2. Read the matching **Kimi ref** file *only* for transformation ideas.
3. Create `apps/api/app/services/knowledge/adapters/<name>_adapter.py`.
4. Subclass `DatabaseAdapter` from `app.services.knowledge.base_adapter`.
5. Implement all 11 abstract members:
   `source_name`, `source_version`, `connect`, `disconnect`, `fetch`,
   `normalize`, `validate`, `get_provenance`, `get_license`,
   `get_confidence`, `health_check`.
6. Use the built-in cache utilities (`_get_cache_path`, `_write_cache`,
   `_read_cache`) — don't roll your own.
7. Use `_calculate_confidence_score` and `_flag_research_only` rather than
   reinventing them.
8. Create `apps/api/tests/test_<name>_adapter.py` mocking HTTP.
9. Register the adapter in
   `apps/api/app/services/knowledge/adapter_registry.py` with an
   appropriate tier (P0 / P1 / P2).
10. Open one PR per adapter through the standard
    `kimi-session-finish.sh` gate.

When the PR lands and CI is green, this roadmap's row gets its ✅. The
corresponding Kimi reference file may then be deleted (separate PR).

## Current scoreboard

- ✅ Implemented in production: **16 / 52** (31%)
- 📋 Briefed and ready to implement: **24 / 52** (46%)
- 🚧 Need additional research (Kimi-truncated): **10 / 52** (19%)
- 🔄 Newly catalogued (Category 11 additions 2026-05-19): **1 / 52** (2%) — Dimensions, blocked on license; see § 10.2 for the operator decision required. OpenAlex moved to 📋 after briefing — see § 10.1.
- Total addressable: **52** databases tracked here, plus the 16 already
  in production = **68** distinct knowledge sources for the Knowledge
  Layer once complete.
