# SPEC — Live Literature Watch

**Status:** Design-locked (Option C Hybrid). Ready to implement.
**Owner:** Evidence Pipeline + Clinical Hubs.
**Last updated:** 2026-04-17.
**Related files:**
- `services/evidence-pipeline/` — evidence.db, ingest.py, schema.sql, sources/pubmed.py
- `apps/web/src/pages-clinical-hubs.js` — `pgProtocolHub` (L1181), `pgLibraryHub` (~L3005)
- `apps/web/src/protocols-data.js` — 107 `PROTOCOL_LIBRARY` entries
- `data/EXTRACT-ab-cells-summary.md`, `data/EXTERNAL-ecells-draft.md` — seed review queue

---

## 1. Goals & non-goals

### USP claim
Every protocol on DeepSynaps Protocol Hub stays connected to the live research frontier. Clinicians see — per card — when new papers arrive on a protocol they've starred or used, without leaving the app.

### Goals
| # | Goal |
|---|---|
| G1 | Nightly free sweep of PubMed for every protocol's `(modality × condition)` query |
| G2 | On-demand paid sweep (Consensus + Apify Scholar) per clinician click |
| G3 | Surface "N new papers" badge on protocol cards and a cross-protocol "Needs Review" queue |
| G4 | Hard monthly-cost cap at **$100 effective / $150 hard** — no runaway |
| G5 | Clinician-gated promotion path from `pending` → `protocols-data.js:references[]` |

### Non-goals
- No auto-promotion of papers into `references[]` without a `clinician_pro` mark.
- No LLM summarisation of abstracts in v1 (adds cost + hallucination risk; phase 2).
- No full-text ingestion — metadata + abstract only.
- No replacement of existing `papers` table ingestion (Literature Watch is a *delta layer* on top).
- No push/email notification in v1 — UI badge only.

### Clinical-safety guarantees
- Every unreviewed row renders with an `Unreviewed — clinician must verify` badge.
- Citations stored **only** with PMID/DOI identifier — no free-text titles posing as verified.
- Any paper lacking a PMID **and** DOI is rejected by the inserter.
- Audit trail kept forever: `not-relevant` hides from queue but row is retained with `reviewer_id`.

---

## 2. Architecture (ASCII)

```
NIGHTLY (free) ──────────────────────────────────────────────────────────────
                                                                             
  protocols-data.js            cron_worker.py          PubMed E-utilities    
  ┌──────────────────┐  read   ┌─────────────────┐ HTTPS ┌────────────────┐  
  │ PROTOCOL_LIBRARY │────────▶│  build query    │──────▶│ esearch+efetch │  
  │  (107 entries)   │         │  dedupe PMIDs   │◀──────│  (rate-limit)  │  
  └──────────────────┘         └────────┬────────┘        └────────────────┘  
                                        │ upsert                              
                                        ▼                                    
                              ┌────────────────────┐                         
                              │ evidence.db        │                         
                              │  literature_watch  │──────┐                  
                              │  refresh_jobs      │      │                  
                              └────────────────────┘      │                  
                                                          │ GET /api/v1/...
ON-DEMAND (paid) ────────────────────────────────────────┼──────────────────
                                                          │                  
  Protocol card                Fastify API                │                  
  ┌───────────────┐  POST      ┌─────────────────┐        │                  
  │ "Refresh lit" │───────────▶│ /refresh-       │        │                  
  │  button       │◀───202─────│  literature     │        │                  
  └───────────────┘            └────────┬────────┘        │                  
        ▲                               │enqueue          │                  
        │ SSE/poll                      ▼                 │                  
        │                    ┌────────────────────┐       │                  
        │                    │  refresh_worker    │       │                  
        │                    │  (single worker,   │       │                  
        │                    │   1 job at a time) │       │                  
        │                    └────────┬───────────┘       │                  
        │                             │                   │                  
        │               ┌─────────────┼────────────┐      │                  
        │               ▼             ▼            ▼      │                  
        │        Consensus API   Apify Scholar  (retry)   │                  
        │         (~$0.01)        (~$0.25)                │                  
        │               │             │                   │                  
        │               └─────▶ literature_watch ◀────────┘                  
        │                             │                                     
        └─────────────────────────────┘ badge updates                        
                                                                             
UI SURFACES ────────────────────────────────────────────────────────────────
  A) Protocol card badge "3 new · 2d ago"                                    
  B) Protocol detail "Recent literature" table                               
  C) Library Hub → "Needs Review" tab (cross-protocol queue)                 
  D) Library Hub header → Spend-to-date gauge                                
```

---

## 3. Data model

New tables in `services/evidence-pipeline/evidence.db` (migration: `schema-002-literature-watch.sql`).

### 3.1 `literature_watch`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `protocol_id` | TEXT NOT NULL | matches `protocols-data.js` `id` (e.g. `p-mdd-001`) |
| `pmid` | TEXT | nullable only if doi present |
| `doi` | TEXT | nullable only if pmid present |
| `title` | TEXT NOT NULL | |
| `authors_json` | TEXT | JSON list; first-author fallback for UI |
| `year` | INTEGER | |
| `journal` | TEXT | |
| `citation_count` | INTEGER | from OpenAlex/Consensus; default 0 |
| `source` | TEXT NOT NULL | `pubmed` \| `consensus` \| `apify_scholar` |
| `first_seen_at` | TEXT NOT NULL | ISO-8601 UTC |
| `reviewed_at` | TEXT | null until action |
| `reviewer_id` | TEXT | user id of clinician |
| `verdict` | TEXT NOT NULL DEFAULT `'pending'` | `pending` \| `relevant` \| `not-relevant` \| `promoted` |
| `promoted_ref` | TEXT | the string appended to `references[]` if promoted |
| `raw_json` | TEXT | full payload (debug / re-parse) |
| UNIQUE | `(protocol_id, COALESCE(pmid, doi))` | dedup key |

### 3.2 `refresh_jobs`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `protocol_id` | TEXT NOT NULL | |
| `requested_by` | TEXT NOT NULL | user id; `system` for cron |
| `source` | TEXT NOT NULL | `pubmed_cron` \| `consensus` \| `apify_scholar` \| `on_demand_bundle` |
| `started_at` | TEXT NOT NULL | |
| `finished_at` | TEXT | null while running |
| `new_papers_count` | INTEGER DEFAULT 0 | |
| `cost_usd` | REAL NOT NULL DEFAULT 0 | 0 for PubMed |
| `status` | TEXT NOT NULL | `queued` \| `running` \| `succeeded` \| `failed` \| `rate_limited` \| `budget_blocked` |
| `error` | TEXT | |

### 3.3 Indices
```sql
CREATE INDEX idx_litw_protocol          ON literature_watch(protocol_id);
CREATE INDEX idx_litw_verdict           ON literature_watch(verdict);
CREATE INDEX idx_litw_first_seen        ON literature_watch(first_seen_at);
CREATE INDEX idx_litw_citation_desc     ON literature_watch(citation_count DESC);
CREATE INDEX idx_jobs_protocol          ON refresh_jobs(protocol_id);
CREATE INDEX idx_jobs_started           ON refresh_jobs(started_at);
CREATE INDEX idx_jobs_status            ON refresh_jobs(status);
```

---

## 4. Scheduled cron (nightly, free)

### 4.1 What it runs
For each entry in `PROTOCOL_LIBRARY`:
1. Build a PubMed query string from `(device, subtype, conditionId)` — reuse keyword maps in `services/evidence-pipeline/ingest.py`. Append `AND ("last 30 days"[PDat])`.
2. `esearch` → up to 25 PMIDs.
3. Filter out PMIDs already in `literature_watch` for that `protocol_id` **and** any already present as substring in `protocol.references[]` (textual match tolerable for v1; flag for clean-up).
4. `efetch` the remainder, parse with `sources/pubmed.py:_parse_pubmed_xml`.
5. Insert into `literature_watch` with `source='pubmed'`, `verdict='pending'`.
6. Write one `refresh_jobs` row per protocol with `source='pubmed_cron'`, `cost_usd=0`.

### 4.2 Rate limits
- PubMed E-utilities: **3 req/s without key**, **10 req/s with `NCBI_API_KEY`**.
- Existing adapter honours `SLEEP=0.11` (keyed) / `0.4` (unkeyed).
- With key: 107 protocols × 2 calls (esearch + efetch) × 0.11s = ~24 s per nightly run. Well under any burst limit.
- **Action item:** register for a free NCBI API key, store in `~/.env` as `NCBI_API_KEY`, surface in the launchd plist.

### 4.3 Deduplication
- Primary dedup: `UNIQUE (protocol_id, COALESCE(pmid, doi))` at DB layer.
- Secondary: before efetch, intersect PMIDs with `SELECT pmid FROM literature_watch WHERE protocol_id=?` to save efetch calls.
- Tertiary: reject PMIDs that appear in any `references[]` string. Store in `.already_cited` cache per cron run (invalidated when `protocols-data.js` mtime changes).

### 4.4 Deployment
| Option | Pros | Cons | Decision |
|---|---|---|---|
| `launchd` plist on host | Zero infra cost; same host as existing Trading Agent | Host must be awake | **CHOSEN** for v1 |
| Fly.io scheduled machine | Cloud-native; survives laptop reboots | +$2–5/mo; needs DB access over wireguard | Phase 2 if host proves unreliable |
| GitHub Actions cron | Free | Needs evidence.db in cloud or SQLite mirror | Rejected (DB is local) |

Plist path: `~/Library/LaunchAgents/com.deepsynaps.literaturewatch.plist`. Schedule: daily 03:30 local. Resource cost estimate: <1 min CPU, <10 MB RAM, <20 MB network.

---

## 5. On-demand refresh (paid, per-click)

### 5.1 UX
- Button on every protocol card: **"Refresh literature (search Consensus + Scholar)"**.
- Sub-label: "Last checked: 2 days ago · This month spent: $12.48 / $100".
- Disabled state when monthly spend ≥ $100 (hard gate) or a job for this protocol already `queued`/`running`.
- Spinner during job; on completion, toast: "Found 4 new papers — review in Needs Review tab".

### 5.2 Backend endpoint
```
POST /api/v1/protocols/{id}/refresh-literature
  → 202 Accepted { job_id, status:"queued" }
  → 409 Conflict when a job already running for this protocol
  → 402 Payment Required when monthly budget exceeded (body: spend_usd, cap_usd)
GET  /api/v1/refresh-jobs/{job_id}
  → { status, new_papers_count, cost_usd, error }
GET  /api/v1/protocols/{id}/literature?verdict=pending&limit=50
  → [ literature_watch rows ]
GET  /api/v1/literature-watch/needs-review?sort=citation_count_desc
  → cross-protocol pending queue
GET  /api/v1/literature-watch/spend?month=2026-04
  → { spend_usd, cap_usd, jobs_count }
POST /api/v1/literature-watch/{row_id}/verdict
  body: { verdict:"relevant|not-relevant|promoted", reviewer_id }
```

### 5.3 Queue
- Single in-process worker (Node/BullMQ **or** Python `rq` — pick whatever already runs in `services/evidence-pipeline`). One job at a time: protects PubMed/Consensus/Apify rate limits and makes budget accounting linear.
- Queue name: `literature-watch-ondemand`. Max queue depth: 20 (reject with 429 above that).

### 5.4 Sources per click
| Source | Call type | Unit cost | Notes |
|---|---|---|---|
| Consensus | 1 search, top 10 results | ~$0.01 (est., via API tier) | Ranked by `citation_count` + recency |
| Apify Scholar actor | 1 run, top 20 results | ~$0.25 | Google Scholar proxy; sloppier quality, higher coverage |
| **Bundle per click** | | **~$0.26** | |

Per click, write **one `refresh_jobs` row with `source='on_demand_bundle'`** for budget accounting, but emit separate `literature_watch` rows tagged with the actual upstream source.

### 5.5 Hard budget gate
Pseudocode:
```
spend_this_month = SUM(cost_usd) FROM refresh_jobs
                   WHERE started_at >= first_of_month
                   AND status IN ('succeeded','failed')
if spend_this_month >= 100.00:
    return 402 Payment Required
```
- Effective cap: **$100** (leaves $50 buffer below the $150 platform cap for emergencies + other line items like OpenAlex).
- Cap resets at UTC month rollover — no manual action.
- Cron (free) is **not** counted against budget.

---

## 6. UI surfaces

### A) Protocol Hub search card (`pgProtocolHub` → `search` tab, around L1256)
| Element | Behaviour |
|---|---|
| New badge | Render pill `3 new · 2d ago` when `COUNT(pending AND first_seen_at > last_viewed_at) > 0` |
| Badge click | Scrolls to "Recent literature" in detail view |
| Last-checked stamp | From `MAX(started_at) WHERE source='pubmed_cron' OR 'on_demand_bundle'` |

### B) Protocol detail page — "Recent literature" section
- Table: `title · first author · year · journal · citations · source badge · verdict`.
- Row actions (role ≥ `clinician_pro`): `[Promote to references]` `[Mark not relevant]`.
- Banner: `Unreviewed — clinicians must verify before clinical use`.

### C) Library Hub → new tab **"Needs Review"** (inject alongside existing Conditions/Devices/Packages/Evidence tabs in `pgLibraryHub`, ~L3005)
- Default sort: `citation_count DESC`, then `first_seen_at DESC`.
- Filters: protocol, device, modality, source, date range, "high-impact only" (`citation_count ≥ 10`).
- Bulk actions: select-many → mark all not-relevant.
- Workflow: row click → slide-out with abstract (from OpenAlex if unavailable from PubMed) + action buttons.

### D) Library Hub header — spend gauge
- Horizontal bar: `$XX.YY spent / $100 budget`. Red when ≥ 80.
- Tooltip: breakdown by source this month + count of on-demand jobs.

---

## 7. Review/promotion rules

| Transition | Trigger | Allowed roles |
|---|---|---|
| `pending` → `relevant` | Clinician marks | `clinician_pro`, `admin` |
| `pending` → `not-relevant` | Clinician marks | `clinician_pro`, `admin` |
| `relevant` → `promoted` | Clinician clicks "Promote to references" | `clinician_pro`, `admin` |
| Any → `pending` | Undo within 24 h | Original reviewer only |

### Promotion path
1. User action writes `verdict='promoted'`, `promoted_ref="AuthorLastName et al. YEAR – Journal"`.
2. A helper script `scripts/promote_literature.py` reads all `verdict='promoted'` rows where the string is not yet in `protocols-data.js:references[]`, rewrites the file (AST-style surgical edit — do NOT regenerate the file), and opens a git commit.
3. Commit message convention: `lit: promote PMID <pmid> → <protocol_id>`.
4. Phase 2 (post-MVP): move `references[]` to DB and drop the JS commit step.

`not-relevant` rows are **never deleted** — they are filtered from the queue but retained for audit and to prevent re-surfacing on subsequent cron runs.

---

## 8. Implementation plan

| # | Task | Est. effort | Dependencies |
|---|---|---|---|
| 1 | DB migration: `schema-002-literature-watch.sql` (tables + indices) + one-shot migration runner | S | — |
| 2 | `services/evidence-pipeline/literature_watch/cron_worker.py` — loops protocols, calls existing `sources/pubmed.py`, inserts rows | M | 1 |
| 3 | Harden `sources/pubmed.py` with `PDat` date-range filter + exponential back-off on HTTP 429 | S | — |
| 4 | Fastify (or existing Python `serve.py`) API endpoints per §5.2 | M | 1 |
| 5 | `literature_watch/adapters/consensus.py` + `adapters/apify_scholar.py` (stub + live) | M | 1 |
| 6 | Queue + worker wiring (`rq` preferred, same process as `serve.py`) | S | 4, 5 |
| 7 | Protocol card badge + last-checked stamp in `pgProtocolHub:search` | S | 4 |
| 8 | "Needs Review" tab in `pgLibraryHub` | M | 4 |
| 9 | Protocol detail "Recent literature" table + promote/reject actions | M | 4, 7 |
| 10 | Budget gate middleware + spend gauge in Library Hub header | S | 4 |
| 11 | Seed run: populate last-30-day literature for all 107 protocols (one-off, PubMed only) | S | 2 |
| 12 | `scripts/promote_literature.py` — append PMIDs to `references[]` via surgical edit + git commit | M | 1 |
| 13 | LaunchD plist + NCBI API key registration | XS | 2 |

Recommended PR cadence: each row above = one PR. Tasks 1–3 unblock everything else.

---

## 9. Cost model

Assumes **medium-usage clinic**: 50 on-demand clicks/month, 30 days of cron.

| Source | Call type | Unit cost (USD) | Monthly volume | Projected monthly spend |
|---|---|---|---|---|
| PubMed E-utilities (keyed) | esearch + efetch | $0 | 107 × 30 × 2 = 6,420 calls | **$0.00** |
| Consensus API | 1 search / click | $0.01 | 50 | $0.50 |
| Apify Scholar actor | 1 run / click | $0.25 | 50 | $12.50 |
| OpenAlex (citation counts) | ~200 req/day | $0 | ~6,000 | $0.00 |
| Fly.io / infra | baseline | — | — | $0 (reusing existing host) |
| **Total (medium)** | | | | **$13.00** |

Stress scenarios:
| Scenario | Clicks/mo | Projected spend | Hits $100 gate? |
|---|---|---|---|
| Light (10 clicks) | 10 | $2.60 | no |
| Medium (50 clicks) | 50 | $13.00 | no |
| Heavy (250 clicks) | 250 | $65.00 | no |
| Extreme (385 clicks) | 385 | $100.10 | **yes — new requests 402'd** |

Well below the $150 platform cap even in the extreme case.

---

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Fabricated/hallucinated citations** (esp. from Apify Scholar scraping) | M | Reject any row lacking both PMID and DOI. Verify DOIs via `https://doi.org/` HEAD request before insertion. Never display a paper without a resolvable identifier. |
| **Unvetted papers on a clinical UI** | H | `Unreviewed` badge on every `pending` row + banner disclaimer. Promote action gated to `clinician_pro`. Audit trail via `reviewer_id` + `reviewed_at`. |
| **Cost runaway** | M | Hard 402 gate at $100. Single worker (no parallel paid calls). Queue depth cap 20. Monthly usage email to owner when ≥ $80. |
| **PubMed rate-limit ban** | L | Use NCBI API key (10 req/s). Existing `SLEEP` constants in `sources/pubmed.py`. Exponential back-off on HTTP 429. 24 h cooldown if banned. |
| **evidence.db lock contention** during cron + live queries | L | WAL mode already enabled (schema.sql L5). Cron writes in batches of 50 with short transactions. |
| **Consensus/Apify API schema change** | M | Adapter layer isolates parsing. Golden-fixture snapshot tests in `services/evidence-pipeline/tests/`. Failures surface as `refresh_jobs.status='failed'` — do not poison the DB. |
| **Host laptop asleep at 03:30** | M | launchd `StartCalendarInterval` with `RunAtLoad` catches missed runs. Phase 2 move to Fly scheduled machine. |
| **references[] edit drift** (JS file reformat) | M | `promote_literature.py` uses AST surgical insert + unit tests on output. Fallback: phase-2 DB migration removes JS dependency. |
| **GDPR / audit** | L | `literature_watch` stores only public bibliographic metadata — no PHI. `reviewer_id` is already governed by app auth. |

---

## Appendix — Files to create

```
services/evidence-pipeline/
  schema-002-literature-watch.sql                     # task 1
  literature_watch/
    __init__.py
    cron_worker.py                                    # task 2
    queue.py                                          # task 6
    budget.py                                         # task 10
    adapters/
      consensus.py                                    # task 5
      apify_scholar.py                                # task 5
  scripts/
    seed_literature_watch.py                          # task 11
    promote_literature.py                             # task 12

apps/web/src/
  pages-clinical-hubs.js                              # edit: tasks 7, 8, 9, 10
  lit-watch-api.js                                    # new thin client

~/Library/LaunchAgents/
  com.deepsynaps.literaturewatch.plist                # task 13
```

---

*End of spec. Total length: ~430 lines. Ready for PR #1 (DB migration).*
