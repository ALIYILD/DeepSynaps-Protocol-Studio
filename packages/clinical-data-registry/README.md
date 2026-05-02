# packages/clinical-data-registry

Shared CSV loader primitives and clinical-data filename constants used by
`apps/api/app/services/` and other consumers.

This package owns the low-level mechanics of reading the imported clinical
CSVs:

- `_read_csv_records(path)` — eager, UTF-8-sig-aware reader that
  normalizes mojibake punctuation via `TEXT_REPLACEMENTS`.
- `_csv_reader(path)` — streaming `(handle, csv.DictReader)` helper used
  by ranking / filtering pipelines (e.g. `neuromodulation_research`).
- `_clean_text`, `TEXT_REPLACEMENTS` — punctuation cleanup primitives.
- `_BRAIN_REGIONS_FILE`, `_QEEG_BIOMARKERS_FILE`,
  `_QEEG_CONDITION_MAP_FILE` — canonical CSV filenames consumed by
  `apps/api/app/services/neuro_csv.py`.

The `apps/api/app/services/clinical_data` and `apps/api/app/services/neuro_csv`
modules currently re-export these names so older callers keep working.
Those shims will be dropped in a future release once direct imports of
`clinical_data_registry` have replaced them.

See `docs/adr/0009-registry-packages.md` for context.
