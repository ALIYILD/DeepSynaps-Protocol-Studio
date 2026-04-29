# Neuromodulation Workbook / Export Integrity

Updated: 2026-04-29

## Best authoritative deliverables

Use the repo-staged bundle under `data/research/neuromodulation` as the authoritative handoff location.

- `manifest.json`
  - authoritative asset inventory for staged paths, hashes, byte sizes, and row counts
- `neuromodulation_master_database_enriched.csv`
  - authoritative enriched paper-level export
- `deepsynaps-evidence-enriched.xlsx`
  - authoritative human-readable workbook derived from the staged bundle
- `derived/neuromodulation_product_ingest.csv`
  - compact product-ingest export when a reduced CSV is needed

The Desktop folder `~/Desktop/neuromodulation_research_bundle_2026-04-22` remains the upstream source bundle, but it contains several historical workbook variants. Those Desktop workbook variants should be treated as working artifacts, not the preferred authoritative deliverables after staging into the repo.

## Integrity findings

- The staged repo bundle uses `manifest.json` paths as the current truth.
- Several generated CSVs that used to live at the Desktop bundle root now live under `derived/` in the staged repo bundle.
- Two repo workbook/export scripts were still assuming the older legacy root layout for some assets:
  - `services/evidence-pipeline/build_desktop_excel_workbook.py`
  - `services/evidence-pipeline/build_desktop_neuromodulation_database.py`
- `EXPORT_STATUS.md` also had a stale clinical-trials row count that did not match the staged manifest.

## Fixes applied

- Both workbook/export scripts now resolve staged assets from `manifest.json` first.
- Both scripts keep legacy path fallback support so they still work against the older Desktop bundle layout.
- `EXPORT_STATUS.md` now reflects the current staged manifest row count for clinical trials.

## Practical guidance

- For integrity checks, trust `manifest.json` first.
- For the main research corpus, use `neuromodulation_master_database_enriched.csv`.
- For workbook handoff, use `deepsynaps-evidence-enriched.xlsx`.
- For rebuilds, prefer the repo-staged bundle root because the scripts now support both staged and legacy layouts.
