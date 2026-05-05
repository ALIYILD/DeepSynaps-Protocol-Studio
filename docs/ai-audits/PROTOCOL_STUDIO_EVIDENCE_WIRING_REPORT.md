# Protocol Studio — Evidence Database / Literature Wiring Report (Agent 2)

## Executive summary
- **Local-first evidence is real but runtime-dependent**: the API expects a local SQLite corpus (`evidence.db`) built by the repo’s evidence ingest pipeline. The DB file is **not** checked into this repo checkout, so availability depends on environment configuration (`EVIDENCE_DB_PATH`, container image, or deployed Fly volume).
- **Two distinct “evidence” worlds exist today**:
  - **Curated registry evidence** from clinical CSVs (`data/imports/clinical-database/*.csv`) surfaced via `apps/api/app/services/evidence.py`.
  - **Literature corpus evidence** from the SQLite `evidence.db` + optional Postgres (`ds_papers`, `literature_papers`) surfaced via `apps/api/app/routers/evidence_router.py` and `apps/api/app/services/evidence_intelligence.py`.
- **Live providers are primarily ingest-time, not request-time**: PubMed/OpenAlex/ClinicalTrials.gov/openFDA/etc are used by `services/evidence-pipeline/ingest.py` to populate the local corpus; the API generally does **not** call external literature providers on each query.

## What evidence sources exist (and what is actually present in this repo)

### 1) SQLite evidence corpus (`evidence.db`)
- **Expected location**: `EVIDENCE_DB_PATH` env var, else `services/evidence-pipeline/evidence.db`, else `/app/evidence.db`.
- **In this repo checkout**: `evidence.db` is **not present** (so local corpus availability is environment-dependent).
- **Indexing**: API assumes SQLite **FTS5** tables exist (e.g. `papers_fts`, `trials_fts`) and uses them in router/search logic.
- **Primary API**: `apps/api/app/routers/evidence_router.py` under `/api/v1/evidence/*`.

### 2) Neuromodulation research bundle (`data/research/neuromodulation`)
- **Manifest claims** large datasets (e.g., 184k+ rows), but most files are **not present** in this checkout.
- Only a small derived CSV appears present: `data/research/neuromodulation/derived/neuromodulation_adjunct_evidence.csv`.
- Bundle-backed endpoints can 503 when required datasets are missing; bundle root can be external via `DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT`.

### 3) Curated clinical CSV evidence (registry-level)
- Present and used: `data/imports/clinical-database/evidence_levels.csv` and related clinical CSVs.
- API wrapper: `apps/api/app/services/evidence.py` returns `list_evidence_from_clinical_data()`.
- This is **registry evidence** (protocols + reference URLs), not paper-level corpus search.

### 4) Optional Postgres/pgvector sources
- `apps/api/app/services/evidence_intelligence.py` can query:
  - `DsPaper` (app DB table) keyword search
  - `LiteraturePaper` (clinician library table) keyword search
  - optional pgvector ANN via `apps/api/app/services/pgvector_bridge.py`
- Degrades safely to keyword and/or SQLite fallback if not configured.

## Existing evidence endpoints (current API map)

### Evidence corpus router
- File: `apps/api/app/routers/evidence_router.py`
- Prefix: `/api/v1/evidence`
- Notable endpoints:
  - `GET /api/v1/evidence/health` (clinician; 503 if DB missing)
  - `GET /api/v1/evidence/status` (counts/last_updated; returns zeros if DB missing)
  - `GET /api/v1/evidence/papers`, `/papers/{id}`, `/papers/stats`, `/papers/similar/{id}`
  - `GET /api/v1/evidence/trials`, `/devices`, `/export.xlsx`
  - `POST /api/v1/evidence/admin/refresh` (admin-only; triggers ingest job)

### Evidence intelligence (RAG-ish)
- File: `apps/api/app/services/evidence_intelligence.py`
- Key behavior:
  - Tries Postgres tables first, then SQLite fallback.
  - If nothing found, returns a **deterministic demo fallback** (`paper_id` begins `demo-`) and refuses saving those citations.

### Clinical registry evidence list
- File: `apps/api/app/services/evidence.py`
- Provides curated evidence records derived from clinical CSV imports.

## Proposed Protocol Studio facade endpoints (no invented citations)

### Design principle
Implement `/api/v1/protocol-studio/evidence/*` as **thin facades** over existing `/api/v1/evidence/*` and registry evidence services. Do **not** merge registry evidence and paper corpus into a single ambiguous endpoint. The facade must expose **provenance** and **availability** so the UI can be honest when the corpus or live providers are unavailable.

### Recommended endpoints (facade over existing evidence services)

1) `GET /api/v1/protocol-studio/evidence/health`
- Purpose: doctor-facing, cheap, honest status for:
  - local SQLite corpus availability + counts + freshness
  - literature watch snapshot availability (if used)
  - vector capability availability (pgvector extension/runtime)
  - live provider **configuration presence** only (no network calls)

2) `GET /api/v1/protocol-studio/evidence/search`
- Facade over existing corpus search endpoints:
  - Likely proxy to `/api/v1/evidence/papers` and `/api/v1/evidence/trials` with unified query params.
- Must include required fields per hit (when available):
  - title, authors, year, DOI/PMID, journal/source, abstract/summary (if present),
  - intervention/modality, condition, target, population,
  - evidence type, evidence grade (if present), sample size (if present),
  - effect summary (if present), limitations (if present),
  - link/source, and provenance: local/live/cached + retrieved_at.
- Honest behavior:
  - If `evidence.db` missing: return 503 or return empty results with `availability=false`. Prefer consistency with current evidence router behavior (503 + clear message).

3) `GET /api/v1/protocol-studio/evidence/{id}`
- Facade over `/api/v1/evidence/papers/{id}` (or trials/devices as applicable).

4) Convenience filters (facade)
- `GET /api/v1/protocol-studio/evidence/by-condition/{condition}`
- `GET /api/v1/protocol-studio/evidence/by-target/{target}`
- `GET /api/v1/protocol-studio/evidence/by-modality/{modality}`
- These can be implemented by composing search parameters rather than creating new storage.

## How to meet “do not fake live literature”
- **Never call external APIs during search unless explicitly implemented and configured**.
- When the corpus DB is missing or live provider keys are not configured, the API and UI must say so explicitly:
  - “Live literature unavailable; using indexed local evidence corpus.” or
  - “Evidence corpus unavailable (not ingested).”
- If evidence intelligence returns `demo-*` records, clients must display a **demo/unverified** banner and must not allow saving as real citations.

## Tests to add (patterns already exist)

### Existing tests to reuse
- `apps/api/tests/test_evidence_router.py`
- `apps/api/tests/test_evidence_corpus.py`
- `apps/api/tests/test_evidence_intelligence.py`

### Facade tests (recommended)
- `test_protocol_studio_evidence_health_db_missing`:
  - no `EVIDENCE_DB_PATH` and repo-local DB absent → health returns `available=false` for sqlite corpus and does not fabricate counts.
- `test_protocol_studio_evidence_search_503_when_db_missing` (or empty + availability flag; choose one policy and assert it):
  - should be consistent and honest.
- `test_protocol_studio_evidence_search_returns_required_fields`:
  - build tiny fixture DB from `services/evidence-pipeline/schema.sql` + migrations and ensure returned JSON contains the required minimal fields with correct provenance.

## Key code and data references
- Evidence router: `apps/api/app/routers/evidence_router.py`
- Evidence intelligence: `apps/api/app/services/evidence_intelligence.py`
- Evidence RAG helper: `apps/api/app/services/evidence_rag.py`
- Clinical evidence wrapper: `apps/api/app/services/evidence.py`
- Evidence ingest pipeline: `services/evidence-pipeline/ingest.py`, `services/evidence-pipeline/README.md`, `services/evidence-pipeline/.env.example`
- Optional vector bridge: `apps/api/app/services/pgvector_bridge.py`
- Neuromodulation bundle manifest: `data/research/neuromodulation/manifest.json`

