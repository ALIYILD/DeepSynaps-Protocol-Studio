# ADR 0009 — Keep and expand `*-registry` workspace packages

- Status: Accepted
- Date: 2026-05-02
- Related: Architect Recommendation #9 (PR-A + PR-B)

## Context

`packages/` already hosts several thin registry packages
(`condition-registry`, `device-registry`, `modality-registry`) alongside
heavier engines (`generation-engine`, `safety-engine`, `qeeg-pipeline`,
`render-engine`, `evidence`, etc.). The registries are currently very small
(~1 function each) and at first glance look like scaffolding that could be
collapsed back into `apps/api/app/services/` or absorbed into
`packages/core-schema`.

At the same time, a large block of *clinical-data plumbing* lives inside
`apps/api/app/services/`:

- `clinical_data.py` — defines `_read_csv_records`, `_clean_text`,
  `TEXT_REPLACEMENTS`, the `ClinicalSnapshot`/`ClinicalDatasetBundle`
  dataclasses, validators, and the cached `load_clinical_dataset()` entry
  point. Many other services (`registries.py`, `protocol_registry.py`,
  `neuro_csv.py`) reach across the service boundary to import these
  "private" helpers.
- `neuro_csv.py` — reuses `_read_csv_records` to load brain-region and
  qEEG CSVs, with hard-coded filename constants
  (`_BRAIN_REGIONS_FILE`, `_QEEG_BIOMARKERS_FILE`,
  `_QEEG_CONDITION_MAP_FILE`).
- `neuromodulation_research.py` — owns its own `_csv_reader` plus a large
  catalogue of CSV datasets with caching by `(path, mtime, size)`.

This is shared registry/loader code that crosses module ownership lines,
and it is the natural home for the existing `*-registry` packages once
they are allowed to grow beyond a single helper.

## Decision

1. **Keep the `*-registry` packages.** Do not collapse them into
   `apps/api`, `packages/core-schema`, or a single mega-registry. The
   per-domain split (condition / device / modality / clinical-data) gives
   us a clean boundary for swap-out (e.g. database-backed registries
   later) and a natural grouping for ownership and tests.
2. **Expand `clinical-data-registry` first.** Stand up a new
   `packages/clinical-data-registry/` workspace package and move the
   shared CSV loader primitives into it:
   - `_read_csv_records`, `_clean_text`, `TEXT_REPLACEMENTS`,
     `_csv_reader` (the streaming `(handle, DictReader)` helper used by
     `neuromodulation_research.py`).
   - The CSV filename constants currently scattered through
     `apps/api/app/services/neuro_csv.py`
     (`_BRAIN_REGIONS_FILE`, `_QEEG_BIOMARKERS_FILE`,
     `_QEEG_CONDITION_MAP_FILE`).
3. **Preserve all old import paths via thin re-export shims.**
   `apps/api/app/services/clinical_data.py` and
   `apps/api/app/services/neuro_csv.py` continue to expose the symbols
   they exposed before. Internally they re-export from
   `clinical_data_registry`. This is a zero-behavioural-change refactor;
   any consumer that imports `from app.services.clinical_data import
   _read_csv_records` keeps working.
4. **Drop the shims in a future PR-C** after one clean release on the
   new package, once Grep confirms there are no remaining direct
   consumers.

## Consequences

- `apps/api` shrinks; the CSV-loader primitives now have one canonical
  home and can be unit-tested without spinning up the FastAPI app.
- New domain registries (e.g. brain-region registry, qEEG biomarker
  registry) have an obvious place to land instead of growing
  `app/services/` further.
- Short-term cost: one extra workspace package and a few re-export lines.
  This is much smaller than the cost of leaving "private" service
  helpers as the de-facto cross-service API.

## Alternatives considered

- **Collapse all `*-registry` packages into `core-schema`.** Rejected:
  `core-schema` is a Pydantic schema package and should not own filesystem
  / CSV concerns. Mixing them couples schema validation to data
  provisioning.
- **Move loaders into a new `packages/data-loader/` instead of
  `clinical-data-registry/`.** Rejected: the loaders are inseparable
  from the clinical-data tables they read. Naming the package after the
  domain (clinical data) instead of the mechanism (loader) keeps the
  package responsibility legible.
- **Inline the loaders into each consumer.** Rejected: this is what we
  have today and it is exactly the cross-service-import smell that
  triggered Recommendation #9.
