# DeepSynaps Studio — Evidence Pipeline

Local, self-hosted evidence database for an evidence-based protocol generator.
Pulls from PubMed, OpenAlex, ClinicalTrials.gov v2, openFDA, and Unpaywall.
No paid services. Targets local SQLite with FTS5 full-text search.

## Layout

```
evidence-pipeline/
  schema.sql               SQLite schema (papers, trials, devices, adverse_events, indications)
  db.py                    connect() / init() helpers
  indications_seed.py      Curated seed taxonomy (DBS/VNS/SCS/rTMS/… × condition)
  ingest.py                CLI: ingest seeds into SQLite
  query.py                 CLI: search papers/trials/devices with evidence ranking
  sources/
    pubmed.py              NCBI E-utilities (esearch + efetch → records)
    openalex.py            OpenAlex /works (citations, OA flag, IDs)
    ctgov.py               ClinicalTrials.gov v2 (preserves stim params in interventions)
    openfda.py             PMA, 510(k), HDE, and MAUDE adverse events
    unpaywall.py           DOI → OA PDF URL
  evidence.db              Created on first run
```

## Required environment

```bash
export NCBI_API_KEY=...          # PubMed 3→10 req/s
export UNPAYWALL_EMAIL=you@x.com # Unpaywall "key" is your email
export OPENFDA_API_KEY=...       # openFDA rate limits (optional but recommended)
```

Not required yet but wired in once keys arrive:
- `SEMANTIC_SCHOLAR_API_KEY` — citation graph + TLDRs
- `UMLS_API_KEY` — SNOMED/ICD/MeSH mapping

## Quick start

```bash
cd ~/Desktop/DeepSynaps-Protocol-Studio/services/evidence-pipeline

# 1. Create schema
python3 ingest.py --init-only

# 2. Ingest one indication (fastest smoke test)
python3 ingest.py --slug rtms_mdd --papers 100 --trials 50

# 3. Ingest everything in the seed (≈20 indications)
python3 ingest.py --all --papers 200 --trials 100 --fda 200 --unpaywall

# 4. Search
python3 query.py --slug rtms_mdd --limit 10
python3 query.py "deep brain stimulation Parkinson" --oa-only
python3 query.py --slug hns_osa --trials-only
```

## Evidence ranking

`query.py` ranks papers by an informed score:
- publication type tier (Meta-Analysis/Guideline > RCT > Clinical Trial > Review > Case Report)
- log-compressed citation count
- recency bonus (year − 2000)
- small OA bonus (+2 when full text is accessible)

This is a *ranking*, not a grade — the indication-level grade A-E lives in `indications.evidence_grade` and comes from the curator.

## Schema notes

- Dedup keys: `pmid` UNIQUE, `doi` UNIQUE, `openalex_id` UNIQUE, `nct_id` UNIQUE, `(kind, number, decision_date)` UNIQUE for devices.
- `papers.sources_json` records which APIs contributed the row so you can audit provenance.
- `trials.interventions_json` is **verbatim** from ClinicalTrials.gov — this is the best open source of actual stim parameters (Hz, µs, mA, session counts). Parse downstream; don't lose it.
- FTS5 virtual tables on `papers_fts(title, abstract)` and `trials_fts(title, brief_summary)` for fast text search.

## Extending the seed

Add a dict to `indications_seed.SEED` with a new slug and queries. Re-run
`python3 ingest.py --slug your_slug`. The schema never changes; the taxonomy
is data.

## What's intentionally missing (add later)

- Semantic Scholar — blocked on API key; will add citation graph + TLDRs.
- UMLS terminology layer — blocked on NIH account; will add ICD/SNOMED mapping to `indications`.
- Protocol extractor (Hz/µs/mA/sessions → structured columns). Right now intervention JSON is stored verbatim; parsing is a follow-up.
- MCP server wrapper so Claude Code can query `evidence.db` as a native tool.

## Rollback

This pipeline is self-contained in this directory and a single SQLite file.
Remove it cleanly with:

```bash
rm -rf ~/Desktop/DeepSynaps-Protocol-Studio/services/evidence-pipeline
```

No system services, no launch daemons, no external DBs.
