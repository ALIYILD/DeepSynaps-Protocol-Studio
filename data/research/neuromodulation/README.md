# Neuromodulation Research Bundle

Repo-local copy of the generated neuromodulation literature bundle used by the
evidence pipeline. This directory is the stable import target for
`services/evidence-pipeline/import_neuromodulation_bundle.py`.

## Layout

- `raw/`: source exports and the unified master paper corpus
- `derived/`: AI-ingestion dataset plus clinic-facing derived CSVs
- `scripts/`: provenance scripts used to build the bundle
- `manifest.json`: file hashes, sizes, row counts, and source bundle path

## Refresh workflow

From the repo root:

```bash
python3 services/evidence-pipeline/import_neuromodulation_bundle.py --stage
python3 services/evidence-pipeline/import_neuromodulation_bundle.py --import-db
```

`--stage` copies the current Desktop bundle from
`~/Desktop/neuromodulation_research_bundle_2026-04-22` into this folder and
rewrites `manifest.json`.

`--import-db` imports the staged bundle into
`services/evidence-pipeline/evidence.db`, populating the core `papers` table
and the neuromodulation-specific enrichment tables.
