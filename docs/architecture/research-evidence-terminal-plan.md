## Research Evidence Terminal Plan

Date: 2026-05-10

### Current Files Found

Backend:
- `apps/api/app/routers/evidence_router.py`
- `apps/api/app/main.py`
- `services/evidence-pipeline/db.py`
- `services/evidence-pipeline/query.py`
- `services/evidence-pipeline/schema.sql`
- `services/evidence-pipeline/migrations/006_protocols_table.sql`
- `services/evidence-pipeline/migrations/009_paper_trial_links.sql`
- `services/evidence-pipeline/migrations/011_indications_computed_grade.sql`

Frontend:
- `apps/web/src/pages-research-evidence.js`
- `apps/web/src/api.js`
- `apps/web/src/evidence-ui-live.js`
- `apps/web/src/live-evidence.js`
- `apps/web/src/research-bundle-workspace.js`
- `apps/web/src/clinical-disclaimer.js`

Existing tests:
- `apps/web/src/pages-research-evidence.test.js`
- `apps/web/src/pages-research-evidence.evidence.test.js`
- `apps/web/src/pages-research-evidence.runtime.test.js`
- `apps/web/src/pages-research-evidence-frontend.test.js`
- `apps/web/src/research-evidence-search-rendering.test.js`
- `apps/web/src/evidence-live-wiring-regressions.test.js`
- `apps/api/tests/test_protocol_studio_router.py`
- `services/evidence-pipeline/tests/test_route_indications.py`
- `services/evidence-pipeline/tests/test_extract_protocols.py`
- `services/evidence-pipeline/tests/test_nightly_enrichment_contract.py`

### Existing API Endpoints

Already present under `/api/v1/evidence`:
- `/status`
- `/indications`
- `/indications/summary`
- `/indications/{slug}/detail`
- `/indications/{slug}/papers`
- `/indications/{slug}/trials`
- `/indications/{slug}/devices`
- `/indications/{slug}/protocols`
- `/papers`
- `/papers/{paper_id}`
- `/papers/stats`
- `/papers/similar/{paper_id}`
- `/trials`
- `/trials/{nct_id}`
- `/devices`
- `/suggest`
- `/for-protocol/{protocol_id}`
- `/search`
- `/research/evidence-graph`

Observation:
- The router already contains evidence DB resolution and safe read-only access patterns.
- The current endpoint set is useful but fragmented for a terminal-style dashboard.
- A dedicated `/api/v1/evidence/terminal/*` surface can wrap the existing DB safely and present stable dashboard/search contracts.

### Database Tables Available

Canonical DB path currently resolves to:
- `services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db`

Core tables confirmed in the live DB:
- `papers`
- `indications`
- `paper_indications`
- `trials`
- `trial_indications`
- `devices`
- `device_indications`
- `protocols`
- `paper_trial_links`
- `adverse_events`
- `device_adverse_events`
- `enrichment_runs`
- `refresh_jobs`
- `literature_watch`

FTS support confirmed:
- `papers_fts`
- `trials_fts`

Important schema notes:
- `indications` has `evidence_grade` and `computed_evidence_grade`
- `papers` has `pmid`, `doi`, `title`, `abstract`, `year`, `journal`, `authors_json`, `sources_json`, `abstract_source`
- `protocols` stores structured extracted parameters and `confidence`
- `paper_trial_links` stores `paper_id`, `trial_id`, `nct_id`, `source`
- The live DB does not contain every planned enrichment column, so queries must not assume `papers.modalities_json`, `conditions_json`, `study_design`, or `effect_direction`

### Frontend Page Structure

Current route:
- `research-evidence`

Current page file:
- `apps/web/src/pages-research-evidence.js`

Current page shape:
- large tabbed clinician evidence workspace
- mixes bundled registry content, live evidence status, indication spine, search, protocol/device views, and related research panels
- already includes governance/disclaimer framing and honest degraded states

Key frontend constraints:
- no dedicated charting dependency is used on this page today
- `apps/web/package.json` includes `plotly.js-dist-min`, but the current evidence page uses inline HTML/CSS/SVG charting

### Charting Library Decision

Decision:
- use existing lightweight HTML/CSS/SVG chart patterns for the terminal first

Reason:
- no current evidence-page dependency on Recharts/Chart.js/ECharts
- avoids adding a heavy dependency for a dense dashboard
- fits existing style and test setup better
- keeps the first implementation focused on real evidence data, search, and safety states

### Implementation Plan

1. Add a dedicated backend service for terminal queries.
- new service layer under `apps/api/app/services/`
- centralize terminal status, overview, indication listing/detail, paper search/detail, trial search, protocol search, network, and grade distribution
- use safe SQLite reads with pagination and bounded result sets
- use FTS where available for paper/trial search

2. Add `/api/v1/evidence/terminal/*` endpoints.
- keep router-local request/response models or add dedicated schemas
- return structured unavailable responses when the DB is missing
- include explicit safety disclaimers in status/overview/detail surfaces

3. Extend the frontend API client.
- add terminal-specific methods in `apps/web/src/api.js`
- keep existing evidence API methods intact

4. Upgrade `pages-research-evidence.js`.
- keep the route, but introduce a terminal-first dashboard/search experience
- preserve the existing safety banners
- add metric cards, grade/modality distributions, top indications, paper search table, paper detail panel, and indication explorer
- render unavailable state honestly if the terminal status says the DB is unavailable

5. Add tests.
- backend endpoint and safety tests for terminal responses
- frontend rendering tests for dashboard, unavailable state, safe metadata rendering, and no fake evidence fallback

6. Write final docs.
- architecture doc
- implementation summary report

### Risks And TODOs

Risks:
- `apps/api/app/routers/evidence_router.py` is already large; keep terminal logic in a service to avoid making the router harder to maintain
- current canonical DB schema is narrower than some existing API assumptions, so terminal queries must be written against confirmed columns only
- `pages-research-evidence.js` is already very large; refactoring may be needed to keep the terminal additions maintainable
- existing unrelated dirty files in `apps/web` must be left alone

TODOs:
- inspect whether `evidence_router.py` already has a reusable search response model worth extending
- confirm whether paper detail should expose full protocol raw text or only bounded snippets
- decide whether the network payload should be indication-scoped only for v1 to keep response size safe
- document recommended indexes for future search optimization without mutating the canonical DB in this PR
