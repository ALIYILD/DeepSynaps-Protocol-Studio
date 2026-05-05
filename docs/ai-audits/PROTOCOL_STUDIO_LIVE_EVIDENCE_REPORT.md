## Protocol Studio — Live Evidence / API / RAG Report (Agent 8)

### Executive summary
- **“Live evidence” in this repo is primarily “live ingest into a local indexed corpus”** (SQLite `evidence.db`) rather than per-request internet searches.
- The web’s live evidence panel (`apps/web/src/live-evidence.js`) queries **API endpoints under `/api/v1/evidence/*`** and handles **503 (“not ingested yet”)** gracefully.
- The repo has a real ingest pipeline (`services/evidence-pipeline/ingest.py`) that can pull from **PubMed, OpenAlex, ClinicalTrials.gov, openFDA** and optional enrichers (Crossref/CORE/Semantic Scholar/Unpaywall) **at ingest time**.
- Protocol Studio should expose an **honest** health/status endpoint under `/api/v1/protocol-studio/evidence/health` that reports what is available (local corpus, literature watch snapshot, vector capability, provider env config presence) **without expensive network calls**.

### What’s wired today (ground truth)

#### Frontend live evidence panel
- **File**: `apps/web/src/live-evidence.js`
- **Behavior**: Calls `/api/v1/evidence/*` endpoints (papers/trials/devices) and renders a compact panel. Explicitly treats missing `evidence.db` as **503 with a friendly message** rather than a crash.

#### Backend evidence router (SQLite corpus)
- **File**: `apps/api/app/routers/evidence_router.py`
- **DB location**: env `EVIDENCE_DB_PATH` else `services/evidence-pipeline/evidence.db` else `/app/evidence.db`.
- **Existing health/status endpoints**:
  - `GET /api/v1/evidence/health` (counts + db_path; auth-gated)
  - `GET /api/v1/evidence/status` and `GET /api/v1/evidence/stats` (aggregate rollups; safe fallbacks)
- **Refresh**:
  - `POST /api/v1/evidence/admin/refresh` (admin-only; runs ingest job)

#### Evidence ingest pipeline (where PubMed/OpenAlex/etc live)
- **File**: `services/evidence-pipeline/ingest.py`
- **Providers implemented** (per pipeline README and sources folder):
  - PubMed (NCBI eutils; `NCBI_API_KEY` optional)
  - OpenAlex (public; typically uses `UNPAYWALL_EMAIL`/`mailto`)
  - ClinicalTrials.gov v2
  - openFDA (optional API key)
  - Optional enrichers: Crossref, CORE, Semantic Scholar, Unpaywall

#### Literature Watch (delta feed per protocol)
- **Router**: `apps/api/app/routers/literature_watch_router.py`
- **Worker**: `services/evidence-pipeline/literature_watch_cron.py`
- **Provider**: PubMed only (today) for watch queue.
- **Static snapshot**: written to `apps/web/public/literature-watch.json` for UI use without needing the API.

#### Vector / pgvector (optional)
- **Bridge**: `apps/api/app/services/pgvector_bridge.py`
- **Usage**: `apps/api/app/services/evidence_intelligence.py` can merge ANN candidates when pgvector + embeddings exist; degrades gracefully otherwise.

### Proposed endpoint: `GET /api/v1/protocol-studio/evidence/health`

#### Goals
- Provide a **single, truthful** view of evidence retrieval capabilities for Protocol Studio.
- **No expensive external calls**; only local checks (file existence, light SQL counts, env var presence).
- Support UI messaging like:
  - “Live literature unavailable; using indexed local evidence corpus.”
  - “Evidence DB not ingested yet.”
  - “Vector search enabled/disabled.”

#### Suggested response shape (example)
```json
{
  "ok": true,
  "timestamp": "2026-05-05T10:47:00Z",
  "retrieval_capabilities": {
    "local_sqlite_corpus": {
      "enabled": true,
      "exists": false,
      "db_path": "services/evidence-pipeline/evidence.db",
      "counts": null,
      "last_ingested_max": null,
      "fts_ready": false
    },
    "literature_watch": {
      "enabled": true,
      "tables_present": null,
      "pending_count": null,
      "static_snapshot": { "exists": true, "path": "apps/web/public/literature-watch.json", "generated_at": "..." }
    },
    "vector": {
      "backend": "postgresql",
      "pgvector_python": true,
      "pgvector_extension": { "enabled": false, "version": null },
      "ds_papers": { "total": null, "embedded": null, "pending_embed": null }
    }
  },
  "live_provider_config": {
    "pubmed": { "configured": true, "has_api_key": false },
    "openalex": { "configured": true, "mailto_set": false },
    "semantic_scholar": { "configured": false },
    "core": { "configured": false },
    "crossref": { "configured": false },
    "unpaywall": { "configured": false },
    "openfda": { "configured": false },
    "clinicaltrials_gov": { "configured": true }
  },
  "defaults": {
    "recommended_mode": "local_plus_live",
    "notes": [
      "No external calls were made to compute this health payload.",
      "Provider 'configured' only indicates required environment variables are present."
    ]
  }
}
```

#### Cheap computation plan (no network)
- **SQLite corpus**: check `os.path.exists(db_path)`; if exists, run simple `count(*)` queries and `MAX(last_ingested)`; check FTS tables via `sqlite_master`.
- **Literature watch**: check snapshot file `apps/web/public/literature-watch.json`; optionally check tables if `evidence.db` exists.
- **Vector**:
  - Use `pgvector_bridge` runtime flags and extension check (already designed to be cheap).
  - If DB available, count `ds_papers` embedded rows (no ANN query).
- **Provider config presence**: env var presence checks only (do not attempt external calls):
  - PubMed: `NCBI_API_KEY` present?
  - OpenAlex/Unpaywall: `UNPAYWALL_EMAIL` present?
  - Semantic Scholar: `SEMANTIC_SCHOLAR_API_KEY` present?
  - CORE: `CORE_API_KEY` present?
  - Crossref: `CROSSREF_MAILTO` present?
  - openFDA: `OPENFDA_API_KEY` present?

### Retrieval modes: `local_only`, `live_only`, `local_plus_live`

#### Repo-accurate semantics
- **`local_only`**: only query already-indexed corpora (SQLite evidence DB, app DB tables, pgvector if present).
- **`live_only`**: only query live providers at request time (not broadly implemented today). If added, must be explicit about network use and failures.
- **`local_plus_live`**: return indexed corpus quickly and optionally augment via user-triggered refresh or asynchronous ingest/watch workflows; degrade honestly if live is unavailable.

#### UI honesty rules
- Do not silently fall back from `live_only` to local without telling the clinician.
- Always label each result with its **provenance** (`indexed_corpus`, `registry_reference`, `live_provider`) and **retrieved_at** when applicable.
- If evidence DB missing, show “Evidence DB not ingested yet” (503-friendly) rather than implying 87k corpus is present.

### Files referenced
- `apps/web/src/live-evidence.js`
- `apps/api/app/routers/evidence_router.py`
- `services/evidence-pipeline/ingest.py`
- `services/evidence-pipeline/README.md`
- `services/evidence-pipeline/.env.example`
- `.github/workflows/evidence-refresh.yml`
- `apps/api/app/routers/literature_watch_router.py`
- `services/evidence-pipeline/literature_watch_cron.py`
- `apps/api/app/services/evidence_intelligence.py`
- `apps/api/app/services/pgvector_bridge.py`
- `apps/api/app/routers/ai_health_router.py`

