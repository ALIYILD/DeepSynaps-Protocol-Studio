# Clinical snapshot manifests

JSON files named `clinical-<hash-prefix>.json` are **written at API startup** when a new clinical CSV bundle is seeded into the database (`seed_clinical_dataset`). The filename derives from `SHA-256` over the imported CSV bytes (`clinical_data._build_source_hash`).

## Refreshing a checked-in manifest (optional)

After editing files under `data/imports/clinical-database/`, you can regenerate the manifest without starting the full API:

```bash
cd apps/api
python ../../scripts/refresh_clinical_snapshot_manifest.py
```

This prints the manifest path and overwrites `data/snapshots/clinical-database/clinical-<prefix>.json`. Older manifests (different hash) may remain in git until removed; only the latest hash matches the current CSV set.

## Sanity

- `EXPECTED_COUNTS` and `EXPECTED_TOTAL_RECORDS` in `app.services.clinical_data` are the single source of truth for per-table and total record expectations.
- `assert_critical_protocol_coverage` enforces critical `(Condition_ID, Modality_ID)` pairs required for protocol-draft device semantics.

## Stale files

Manifests from previous imports can be deleted if confusing; runtime always loads CSVs from `data/imports/clinical-database/`.
