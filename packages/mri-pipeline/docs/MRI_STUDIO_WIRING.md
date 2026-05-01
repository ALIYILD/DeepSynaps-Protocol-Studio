# MRI Analyzer — Studio wiring (API, web, database)

**Purpose:** single reference for how the **shipping** product path connects the
web app, `apps/api`, Alembic schema, and `deepsynaps_mri` package.

## Data flow (happy path)

1. **Web** (`apps/web/src/pages-mri-analysis.js` + `api.js`)  
   - `POST /api/v1/mri/upload` → `POST /api/v1/mri/analyze` → poll `GET /api/v1/mri/status/{job_id}` (or SSE)  
   - `GET /api/v1/mri/report/{analysis_id}` and satellite routes (PDF/HTML/overlay/MedRAG).

2. **API** (`apps/api/app/routers/mri_analysis_router.py`)  
   - Persists rows on **`mri_analyses`** / **`mri_uploads`** with **`*_json`** text columns (migration **039+**).  
   - Pipeline execution goes through `app/services/mri_pipeline.py` → optional `deepsynaps_mri.pipeline.run_pipeline`.

3. **Standalone pipeline DB helpers** (`packages/mri-pipeline/src/deepsynaps_mri/db.py`)  
   - **`save_report` / `load_report`** now target the **same `*_json` column names** as the API Alembic schema.  
   - Set **`DATABASE_URL`** or **`DEEPSYNAPS_DSN`** to the Studio Postgres when running **`ds-mri`** or Celery **`run_pipeline_job`** against one shared database.

## Legacy / alternate schema

- **`medrag_extensions/04_migration_mri.sql`** — reference-only Postgres DDL; **do not** assume it matches an API-managed DB that ran Alembic 039. Prefer Alembic as source of truth.

## Demo preview (`VITE_ENABLE_DEMO=1`)

- JSON routes can be short-circuited in `api.js` for `*-demo-token` sessions.  
- **`apiFetchBinary`** returns a small HTML stub for MRI PDF/HTML/overlay paths so downloads do not spam 401s.  
- Inline MRI viewers avoid **iframe** overlay URLs (no bearer token) and show a fallback message instead.

## Known follow-ups

- Optional **`qc_warnings_json`** column if API starts persisting qc_warnings server-side (currently computed in `_report_from_row` via getattr fallback).

## Live demo (Netlify preview + Fly API)

1. **Preview URL:** https://deepsynaps-studio-preview.netlify.app — `netlify.toml` sets `VITE_ENABLE_DEMO=1` and proxies `/api/*` to Fly (`deepsynaps-studio.fly.dev`).
2. **Sign in** with **Clinician demo** (token ending in `-demo-token`) so MRI JSON routes hit the real API (the client shim skips only passthrough auth endpoints).
3. **MRI Analyzer → Run analysis:** With **`MRI_DEMO_MODE=1`** on Fly (see `apps/api/fly.toml`), `POST /api/v1/mri/analyze` persists the canned **`demo/sample_mri_report.json`** and marks the row **SUCCESS**. The browser polls/SSE then loads **`GET /api/v1/mri/report/{analysis_id}`**.
4. **Offline preview:** Without demo login, the page still shows **`DEMO_MRI_REPORT`** from the bundle.
5. **Production:** Set **`MRI_DEMO_MODE=0`** when deploying full segmentation tooling so analyze runs real jobs instead of the sample report.
