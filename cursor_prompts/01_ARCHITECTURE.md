# Architecture — DeepSynaps Protocol Studio (EEG Studio slice)

## Monorepo layout (relevant paths)

```
apps/web/          React + Vite; EEG Studio under src/studio/
apps/api/          FastAPI; routers under app/routers/, studio under app/routers/studio_*.py
packages/          Shared schema, registries, pipelines (qeeg-pipeline, core-schema, …)
docs/              Governance, ADRs, deployment
cursor_prompts/    Module implementation prompts (this family)
tests/fixtures/    Golden EDF + reference outputs (eeg_studio)
```

## Frontend — EEG Studio (`apps/web/src/studio/`)

| Area | Responsibility |
|------|----------------|
| `main.tsx` / `bootstrap.tsx` | Shell, app switch (viewer vs database) |
| `viewer/` | `EegViewer`, canvas, paging, cursors, montage integration |
| `filters/` | Filter bar, per-channel overrides, API sync |
| `events/` | Markers, fragments, trials; dialogs |
| `montage/` | Montage picker / editor triggers |
| `database/` | Patient/recording browser |
| `artifacts/` | Artifact marking, ICA / template workflows |
| `spectra/` | Spectral / qEEG UI |
| `erp/` | ERP computation dialogs and viewers |
| `source/` | LORETA / dipole UI |
| `spikes/` | Spike detection and review |
| `report/` | Final report editor and export |
| `stores/` | Zustand (`eegViewer`, `filters`, `ai`, `view`, …) |

**Studio URL pattern:** `studio.html` query params for `app` and recording id (see `main.tsx`).

## Backend — API surface

### Studio EEG namespace

Prefix: **`/api/v1/studio/eeg`**

Routers (representative):

| Router | Role |
|--------|------|
| `studio_eeg_router` | Core streaming, recording capabilities |
| `studio_artifacts_router` | Artifact correction, derivatives |
| `studio_spectra_router` | Welch / spectra / indices |
| `studio_erp_router` | ERP / related averages |
| `studio_source_router` | LORETA, dipole |
| `studio_spikes_router` | Spike detect / export |
| `studio_report_router` | Templates, HTML/PDF/DOCX/RTF render |

### Recording timeline

Prefix: **`/api/v1/recordings/eeg`**

- Events, trials, labels — timeline persistence.
- **`analysis_id`** in studio routes refers to **`QEEGAnalysis.id`** (same as “recording” id in many studio flows).

### qEEG platform APIs (parallel families)

Separate prefixes for workbench / trainer / records (e.g. `/api/v1/qeeg-raw`, `/api/v1/qeeg-analysis`, `/api/v1/qeeg-ai`). Do not conflate with studio routes unless the module prompt explicitly bridges them.

## Data flow (viewer)

1. Client loads recording id → **stream** windowed EEG (montage + filters as query params).
2. User actions → **PATCH/POST** events, trials, montage, filter state as defined per router.
3. Derivative jobs (spectra, ERP, …) → async or sync endpoints returning job ids or payloads.
4. **AI store** (`apps/web/src/studio/stores/ai.ts`) receives domain events for M13 (viewport, filters, spectra summary, ERP summary, spikes, report draft).

## Authentication

Studio routes use existing **`get_authenticated_actor`** / role gates (**`clinician`** minimum for sensitive operations). Preserve parity when adding endpoints.

## Reports pipeline

- **Internal:** HTML → PDF (e.g. WeasyPrint) from structured report JSON.
- **MS Word:** `python-docx` from same JSON.
- **Variables:** `{{dotted.path}}` resolved server-side; missing → red placeholder styling.

## Deployment notes

- CORS: `VITE_API_BASE_URL` points to API origin.
- Long jobs: respect timeouts; use polling or WebSocket only if already pattern-matched in repo.

## File naming conventions

- React components: **PascalCase** `ComponentName.tsx`
- Routers: **snake_case** Python files `studio_*_router.py`
- API paths: **kebab-case** URL segments per existing routers

When a module prompt lists concrete paths, **those paths are authoritative** for that task.
