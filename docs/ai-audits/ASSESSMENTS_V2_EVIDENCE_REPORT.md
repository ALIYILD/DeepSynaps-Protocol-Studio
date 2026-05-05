## Assessments v2 — Evidence / 87k Corpus / Live Literature Report

### Executive summary
- **87k corpus exists**: the repository includes an evidence pipeline that produces a local SQLite database (`evidence.db`) with ~87k papers and an API router that reads it.
- **Evidence APIs already exist (v1)**: `GET /api/v1/evidence/*` and `POST /api/v1/evidence/query` provide structured evidence search and “evidence intelligence” retrieval.
- **“Live literature” is partially implemented**: a “Live Literature Watch” feature can refresh **PubMed via NCBI E-utilities** (in-process/background task + cron), but other sources are explicit stubs.
- **Assessments v2 should not invent citations**: the safest v2 path is to *reuse the existing evidence endpoints* and expose an Assessments-v2-specific facade only if needed for UI ergonomics. UI must clearly label evidence as **local corpus**, **curated library**, or **live watch**, and show “unavailable” when not configured.

### What exists today (ground-truth in repo)

#### Evidence DB + corpus size
- **Corpus backing store**: SQLite DB `evidence.db` produced by `services/evidence-pipeline/`.
- **API reads it read-only**: `apps/api/app/routers/evidence_router.py` explicitly states it reads from the standalone SQLite evidence database and never writes to it.
- There is explicit performance commentary for “~87k rows”.

#### Evidence APIs (already implemented)
Located in `apps/api/app/routers/evidence_router.py`:
- `GET /api/v1/evidence/health`
- `GET /api/v1/evidence/papers` (FTS + filters)
- `GET /api/v1/evidence/papers/{paper_id}`
- `GET /api/v1/evidence/papers/similar/{paper_id}`
- `GET /api/v1/evidence/trials`, `GET /api/v1/evidence/trials/{nct_id}`
- `GET /api/v1/evidence/devices`
- `GET /api/v1/evidence/stats`, `GET /api/v1/evidence/status`
- Evidence Intelligence (structured “decision-support” citations + retrieval):
  - `POST /api/v1/evidence/query`
  - `POST /api/v1/evidence/by-finding`
  - `GET /api/v1/evidence/papers/{paper_id}/intelligence`
  - `POST /api/v1/evidence/save-citation`
  - `GET /api/v1/evidence/patient/{patient_id}/saved-citations`

#### Curated “library” vs corpus
- Curated evidence library endpoints exist separately under `apps/api/app/routers/literature_router.py` and store clinician-curated items in the primary app DB (models in `apps/api/app/persistence/models/research.py`).

#### Live literature search / watch
- “Live Literature Watch” is implemented for PubMed:
  - Router: `apps/api/app/routers/literature_watch_router.py`
  - Cron: `services/evidence-pipeline/literature_watch_cron.py`
  - PubMed client: `services/evidence-pipeline/pubmed_client.py`
- Source roadmap notes that Consensus/Apify adapters are explicitly not wired.
- Environment keys used:
  - `PUBMED_API_KEY` or fallback `NCBI_API_KEY` (optional; affects rate limiting)
  - `PUBMED_EMAIL` (recommended)

#### Vector/RAG status
- Optional pgvector bridging exists (`apps/api/app/services/pgvector_bridge.py`) and an admin status endpoint exists.
- `apps/api/app/services/evidence_intelligence.py` already supports multi-backend retrieval (Postgres ds_papers, curated library, SQLite corpus, or demo fallback) and can optionally do embeddings when available.
- `GET /api/v1/health/ai` reports capability for “medrag retrieval” based on installed packages/env.

### Proposed Assessments v2 evidence endpoints (minimal, honest)

If the Assessments v2 UI wants dedicated endpoints, implement thin facades that re-use existing routers/services and preserve “no fabricated references”:
- **`GET /api/v1/assessments-v2/evidence/health`**
  - Compose from:
    - `GET /api/v1/evidence/health` (corpus availability + counts)
    - AI capability health (`/api/v1/health/ai`) for retrieval/LLM availability
  - Return fields (example):
    - `corpus: { available: boolean, paper_count: number|null, db_path_present: boolean }`
    - `live_literature: { pubmed_supported: true, pubmed_key_present: boolean, pubmed_email_present: boolean, other_sources_supported: false }`
    - `vector: { pgvector_available: boolean, embeddings_available: boolean }`
    - `status: "local" | "degraded" | "unavailable"`

- **`GET /api/v1/assessments-v2/evidence/search`**
  - Wrap `GET /api/v1/evidence/papers` for corpus search.
  - Optional: allow `source_kind=library` to query curated papers (via literature router) if needed.
  - Response must include:
    - `source_kind`: `corpus|library|live`
    - `review_status`: `pending|approved` (where applicable)
    - stable identifiers: DOI/PMID/OpenAlex id when available.

- **`GET /api/v1/assessments-v2/library/{assessment_id}/evidence`**
  - DO NOT invent mappings. Until explicit linking is modeled, return:
    - curated “pinned” citations only if the app has an explicit table of assessment↔paper links
    - otherwise: return empty list plus a clear status: “no curated evidence links configured”

### UI requirements (doctor-ready honesty)
- **Evidence badges must reflect truth**:
  - Local corpus (SQLite ingest) vs curated library vs live watch
  - If PubMed watch not configured/available, show “live literature unavailable” rather than a spinner
- **Never fabricate**:
  - no invented DOI/PMID
  - no invented “validity/reliability” claims; only show summaries when present in stored metadata or curated clinician notes

### Tests to add (when v2 evidence endpoints are implemented)
- evidence health returns structured capability flags
- evidence search returns structured refs (title/authors/year + DOI/PMID fields only when present)
- missing live config shows honest `status=unavailable` and UI renders fallback
- “assessment evidence” endpoint returns empty + explicit status if no mapping exists (no synthetic papers)

### Key files (absolute paths)
- Evidence corpus router: `/workspace/apps/api/app/routers/evidence_router.py`
- Evidence Intelligence: `/workspace/apps/api/app/services/evidence_intelligence.py`
- Evidence RAG helper: `/workspace/apps/api/app/services/evidence_rag.py`
- Live literature watch router: `/workspace/apps/api/app/routers/literature_watch_router.py`
- PubMed client: `/workspace/services/evidence-pipeline/pubmed_client.py`
- Evidence watch spec: `/workspace/docs/SPEC-live-literature-watch.md`
