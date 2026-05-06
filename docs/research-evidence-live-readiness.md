# Research Evidence — Live Readiness & Doctor Demo

## Scope statement

**Research Evidence** (`?page=research-evidence`) is a clinician-facing workspace for literature orientation, evidence grading labels, governance queues, and brokered search — **not** autonomous diagnosis, prescribing, treatment approval, or emergency triage.

## Safety statement

Mandatory UI copy (also rendered on-page):

- This is a **controlled preview evidence workspace**. It supports literature review, evidence grading, and governance workflows only. It does not diagnose, prescribe, approve treatment, triage emergencies, or act autonomously. Evidence summaries require clinician review against current literature, device labelling, patient suitability, and local policy.
- **Bundled registry rollups** are for navigation and preview context. They are not a substitute for verified primary literature retrieval.
- **Regulatory clearance is not the same as clinical efficacy**, and adjacent-condition evidence does not automatically imply indication-specific suitability.

## Live vs bundled vs demo source

| Mode | Detection | UI |
|------|-----------|-----|
| **Live evidence service** | `getEvidenceUiStats()` sees corpus signals: evidence DB row counts via `/api/v1/evidence/status`, or research summary modalities/tiers, or `/api/v1/evidence/research/conditions` list | Green **Live API** badge; no red degraded banner |
| **Bundled / degraded** | No corpus signals from those endpoints (offline, empty DB, or failed transport) | Red banner: *Live evidence service unavailable. Showing bundled registry approximations for navigation only.* + **Bundled registry** badge |
| **Demo / preview** | `import.meta.env.DEV` or `VITE_ENABLE_DEMO=1` | Amber **Demo / preview build** pill |
| **Offline fallback** | `evidenceStatus` promise rejected | **Offline fallback** hint next to source strip |

Bundled figures in `evidence-dataset.js` are **registry orientation only** when the API is offline — not a guarantee that SQLite returned that count for this session.

**Stale wording note:** Earlier marketing referred to an “87k” corpus; that figure is obsolete. On this checkout, local `services/evidence-pipeline/evidence.db` reports **184,669** papers, **0** trials, **0** devices, **`last_ingested`: 2026-04-22T18:18:44Z**. Preview/production deployments **must** be verified via **`GET /api/v1/evidence/status`** (counts vary by environment).

**Source of truth:** The backend resolves the evidence SQLite database through **`EVIDENCE_DB_PATH`**. Dev fallback is `services/evidence-pipeline/evidence.db`; production Fly config uses `/data/evidence.db`. **`GET /api/v1/evidence/status`** is the only authoritative UI signal for live corpus availability and current counts.

## Tab / action matrix (abbrev.)

For the full **label → handler → API → behavior** grid, see section **Button/action matrix** below.

## API endpoint matrix (web client → backend)

| Client method (`api.js`) | HTTP route | Backend area |
|--------------------------|------------|--------------|
| `getResearchSummary` | `GET /api/v1/evidence/research/summary` | `evidence_router` + neuromodulation research services |
| `evidenceStatus` | `GET /api/v1/evidence/status` | `evidence_router` (public counts) |
| `listResearchConditions` | `GET /api/v1/evidence/research/conditions` | `evidence_router` |
| `protocolCoverage` | `GET /api/v1/evidence/research/protocol-coverage` | `evidence_router` |
| `listResearchProtocolTemplates` | `GET /api/v1/evidence/research/protocol-templates` | `evidence_router` |
| `listResearchExactProtocols` | `GET /api/v1/evidence/research/exact-protocols` | `evidence_router` |
| `listResearchSafetySignals` | `GET /api/v1/evidence/research/safety-signals` | `evidence_router` |
| `listResearchEvidenceGraph` | `GET /api/v1/evidence/research/evidence-graph` | `evidence_router` |
| `getResearchAdjunctSummary` | `GET /api/v1/evidence/research/adjunct-summary` | `evidence_router` |
| `listResearchAdjunctEvidence` | `GET /api/v1/evidence/research/adjunct-evidence` | `evidence_router` |
| `getResearchAdjunctReviewTables` | `GET /api/v1/evidence/research/adjunct-review-tables` | `evidence_router` |
| `libraryOverview` | `GET /api/v1/library/overview` | `library_router` |
| `listLiterature` | `GET /api/v1/literature` | `literature_router` |
| `libraryExternalSearch` | `POST /api/v1/library/external-search` | `library_router` (brokered FTS over ingested DB — **no browser-to-PubMed**) |
| `promoteEvidencePaper` | `POST /api/v1/evidence/papers/{id}/promote-to-library` | `evidence_router` |
| `librarySummarizeEvidence` | `POST /api/v1/library/ai/summarize-evidence` | `library_router` |
| `getResearchExportSummary` | `GET /api/v1/evidence/research/exports/summary` | `evidence_router` / export |
| `curateLiteraturePaper` | `POST /api/v1/literature/papers/{pmid}/curate` | `literature_router` |
| `searchEvidencePapers` | `GET /api/v1/evidence/papers` | `evidence_router` (`search_papers` — FTS over ingested SQLite corpus; clinician auth; supports `modality`, `condition`, `grade`, `year_min/max`, `oa_only`, `has_abstract`, `include_abstract`) |
| `searchResearchPapers` | `GET /api/v1/evidence/research/papers` | Neuromodulation CSV bundle — ranked `ResearchPaperOut[]` (optional “ranked research view” — not SQLite FTS) |
| `listResearchEvidenceGraph` | `GET /api/v1/evidence/research/evidence-graph` | Bundle graph slices → `ResearchGraphOut` (paper counts, citations, weights, OA counts, years, study types, safety tags) |
| `searchEvidenceTrials` | `GET /api/v1/evidence/trials` | ClinicalTrials.gov slice from evidence DB |
| `searchEvidenceDevices` | `GET /api/v1/evidence/devices` | FDA PMA/510k/HDE slice |

## Doctor Search Readiness — live indexed paper search

**Purpose:** A clinician typing queries such as `depression rTMS`, `ASD tDCS`, `ADHD neurofeedback`, `chronic pain TPS`, `Alzheimer TPS`, `anxiety tDCS`, `OCD rTMS` should see **honest** rows when the ingest + API are available.

### Endpoint shapes (doctor-visible contract)

| Layer | Endpoint | Response |
|-------|----------|----------|
| **Indexed SQLite FTS** | `GET /api/v1/evidence/papers` | `PaperOut[]`: `id`, `title`, `authors[]`, `year`, `journal`, `pmid`, `doi`, `oa_url`, `europe_pmc_url`, `openalex_id`, `abstract` (when `include_abstract=true`), `modalities[]`, `conditions[]`, `study_design`, `sample_size`, `primary_outcome_measure`, `effect_direction`, `is_oa`, `pub_types[]`, … |
| **Brokered ingest search** | `POST /api/v1/library/external-search` | `ExternalSearchResponse` with `items[]`: `id`, `title`, `year`, `journal`, `authors` (string), `pmid`, `doi`, `url` (from `oa_url` in DB), `pub_types[]`, provenance fields |
| **Curated library** | `GET /api/v1/literature` | Curated rows; client-side filter — badge **Curated library** |
| **Research bundle (optional)** | `GET /api/v1/evidence/research/papers` | `ResearchPaperOut[]` — richer ranking when CSV bundle mounted; shown under **Optional ranked research view** |

### UI behaviour (Evidence Search tab)

- **Source selector:** **All** runs indexed → brokered → curated with **dedupe** by PMID, DOI, id, or title+year. **Evidence DB** runs only `searchEvidencePapers`. **Brokered** runs only `libraryExternalSearch`. **Curated** runs only filtered `listLiterature` snapshot.
- **Filters (indexed path):** modality token (`tms`, `tdcs`, …), grade A–E (via indications join / EXISTS), year range, OA-only, has-abstract, optional **condition** token matching `conditions_json`.
- **Cards:** shared `renderEvidenceResultCard` — title, year, journal, authors (first 3 + “+N more”), snippet or **Abstract unavailable from this record**, link row (**Open ↗**, **DOI**, **PubMed**, **Europe PMC**, **OpenAlex** only when identifiers exist) or **No direct link available from this record.**
- **Expansion note:** “Expanded query terms used for retrieval: …” (transparent synonym OR-groups).
- **Corpus unavailable:** When `GET /api/v1/evidence/status` reports zero papers, an amber banner explains preview limits; brokered/curated may still run for **All sources**.
- **Evidence relationship summary:** `listResearchEvidenceGraph` — cards with counts/weights/years/safety tags; **Explore papers** prefills the search box (literature-index summary, not treatment advice).
- **Trials/devices:** `searchEvidenceTrials` / `searchEvidenceDevices` after a query is entered; honest empty states if the index is missing.

### Manual doctor-demo results (fill during QA)

| Query | Indexed corpus (status) | Source used | # results | Title / authors / year / journal | DOI / PMID / Open / Europe PMC | No-link fallback OK | Graph / explore | Notes / limitations |
|-------|-------------------------|-------------|-----------|-----------------------------------|----------------------------------|---------------------|-----------------|---------------------|
| depression rTMS | paste `/evidence/status` | | | | | | | |
| ASD tDCS | | | | | | | | |
| ADHD neurofeedback | | | | | | | | |
| chronic pain TPS | | | | | | | | |
| Alzheimer TPS | | | | | | | | |
| anxiety tDCS | | | | | | | | |
| OCD rTMS | | | | | | | | |

**Reminder:** The corpus size is **not** hard-coded. Counts and availability come from **`GET /api/v1/evidence/status`**.

## Evidence Search tab — flow trace (Evidence Search Guarantee)

**Goal:** Clinicians search real ingested rows when the DB exists; otherwise see honest errors / curated fallback — never fabricated citations.

### Search box → backend

| Step | Detail |
|------|--------|
| **UI** | `#lib-ext-q` query, `#re-ev-search-source` (`all` \| `indexed` \| `brokered` \| `curated`), optional `#lib-ext-cond` for brokered condition filter |
| **Expansion** | `_reExpandEvidenceSearchQuery()` — optional transparent FTS synonym groups (e.g. depression ↔ MDD); shown in `#re-ev-expanded-note` |
| **Unified handler** | `window._libUnifiedEvidenceSearch()` |
| **Indexed path** | `api.searchEvidencePapers({ q: fts })` → `GET /api/v1/evidence/papers?q=…` → `evidence_router.search_papers` → `PaperOut[]` (title, abstract, modalities, conditions, pmid, doi, oa_url, …) |
| **Brokered path** | `api.libraryExternalSearch({ q, condition_id })` → `POST /api/v1/library/external-search` → same SQLite FTS over ingest (server-side; not browser PubMed) → `ExternalEvidenceItem[]` |
| **Curated path** | `window._reCuratedLitSnapshot` from `listLiterature`; client-side substring filter — clearly labelled **Showing curated library records** |
| **Corpus availability banner** | `api.evidenceStatus()` → `GET /api/v1/evidence/status` — **`total_papers > 0`** ⇒ “Indexed evidence corpus available” + live count from the response; **`0`** ⇒ unavailable banner (**never** claim a live indexed corpus unless status reflects non-zero rows) |
| **Live FTS panel** | `#re-live-evidence-host` → `renderLiveEvidencePanel()` → same `/api/v1/evidence/papers` stack |
| **Results UI** | Cards: PMID/DOI/open-access links **only if API returned values**; abstract snippet or “Abstract unavailable”; source badges per row (**Indexed corpus** / **Brokered indexed search** / curated) |

### Evidence Search demo gate (before doctor demo)

Before showing Research Evidence to a doctor, verify **at least one** is true:

1. The indexed evidence corpus is connected and Evidence Search returns **real** records with source/provenance, **or**
2. Brokered library search returns **real** literature links from the ingest, **or**
3. Curated library search returns **real** records and is clearly labelled **curated/fallback**.

If **none** are true, **do not** claim “searches our full indexed evidence corpus.” Say instead:

> “The Evidence Search interface is present, but the evidence corpus is not connected in this preview environment.”

**Safe doctor-facing wording:**

> “This page can search the connected evidence corpus when the evidence DB is available. In this preview, the source badge shows whether results are from the live indexed corpus, brokered literature search, curated library, or bundled registry context. We do not present bundled rollups as verified citations.”

### Manual search checklist (record in preview environment)

| Query | Expect |
|-------|--------|
| depression rTMS | FTS hits if ingested; synonym expansion note may appear |
| ASD tDCS | Same |
| ADHD neurofeedback | Same |
| chronic pain TPS | Same |
| Alzheimer TPS | Same |

Record: sources connected, which queries returned rows, whether PMID/DOI appeared on cards, empty-state honesty.

_Agent run:_ manual queries not executed in CI — fill this table during preview QA.

## Evidence / citation governance

- **Bundled condition rows** do not ship verified DOI/PubMed drill-downs as primary citations; users are directed to **Evidence Search** / brokered search.
- **Unified Evidence Search** returns indexed ingest rows (`/evidence/papers`) and/or brokered rows (`/library/external-search`) with provenance — when no rows match, the UI shows “No verified results found for this query in the connected evidence sources.” with next-step hints — never fabricated papers.
- **AI summaries** are labeled draft; they cite supplied paper IDs; provider failures surface honest errors.
- **Literature Watch** triage uses `/literature-watch.json` snapshot when present; empty state explains cron/build path.

## Known limitations

- Without `evidence.db` ingest, FTS panels and brokered search return **503 / empty** — UI must not invent results (handled).
- `getEvidenceUiStats` caches the first resolution for the SPA session (`resetEvidenceUiStatsCache()` exists for tests).
- LocalStorage literature verdicts are **browser-local** only.

## Preview backend acceptance — indexed evidence corpus

The repo may contain evidence pipeline assets, but **only the deployed preview backend** decides whether the UI searches the live ingest.

### Acceptance criteria (follow-up)

1. **`GET /api/v1/evidence/status`** returns **`total_papers` > 0** at the scale your deployment ingested (local dev example on this checkout: **184,669** papers — **do not** assume the same number in Fly until you paste the JSON). Record the **exact JSON** below under “Actual status (paste after QA)”.
2. Research Evidence shows **`indexedCorpusAvailable`** in the UI as: source strip **Indexed DB** badge + **no red degraded banner** when status confirms a non-empty ingest.
3. Evidence Search uses **`GET /api/v1/evidence/papers`** for the indexed path (FTS over the same SQLite DB).
4. Queries **depression rTMS**, **ASD tDCS**, **ADHD neurofeedback**, **chronic pain TPS**, **Alzheimer TPS** return real rows when the ingest contains matches (empty state must remain honest if no hit).
5. If the DB exists **locally** but Fly/preview does **not** mount `evidence.db`, the UI must **not** pretend the corpus is live — status will show **0**; source strip stays **bundled/unavailable** and the Evidence Search banner says corpus unavailable for **this environment**.
6. **Red degraded banner** must **not** appear when status confirms **`total_papers` > 0** (`indexedCorpusAvailable` in `getEvidenceUiStats`).
7. Bundled registry KPI rows must **never** appear as rows in **Evidence Search results** (only dedicated bundled tabs/context).
8. Fill in **actual** curl outputs after QA.

### Where to see connection status in the UI (besides Research Evidence)

**Settings → System Health → Health Overview** (`settings-v2`, System Health tab): an **“Indexed evidence corpus”** card calls the same **`GET /api/v1/evidence/status`** as the Research Evidence banners. It shows **INDEXED DB** when `total_papers` / trials / FDA sums are non-zero, **EMPTY** when the ingest reports zeros (DB not mounted), or **UNAVAILABLE** if the request fails — plus a shortcut button to **Research Evidence → Evidence Search**.

### Smoke checks (replace `YOUR_API_URL`)

```bash
curl -sS "https://YOUR_API_URL/api/v1/evidence/status"
# Expect: total_papers > 0 when ingest is mounted (exact count is deployment-specific).

curl -sS "https://YOUR_API_URL/api/v1/evidence/papers?q=depression%20rTMS&limit=5"
# Expect (when clinician-auth cookie/header used in browser): real PaperOut fields —
# title, year, journal, authors, abstract/snippet if present, PMID/DOI/OA URL when present,
# modality/condition tags when enriched.
```

**Actual status response (paste after preview QA):**

```json
{
  "_comment": "Paste GET /api/v1/evidence/status JSON from preview Fly/backend here."
}
```

**Sample papers query result notes:** _(optional)_ paste first hit title + PMID or “empty array” if FTS returned none.

### Doctor-demo wording (dynamic corpus size)

Strongest single line for reviewers:

> The evidence corpus size is **not** hard-coded. The page reads **`GET /api/v1/evidence/status`** and only treats the indexed corpus as **live** when that endpoint confirms available records.

Full script (adjust counts to whatever status returns in **this** preview):

> This preview is connected to our indexed evidence database when **`/api/v1/evidence/status`** reports non-zero rows. In this checkout, the local indexed corpus contains approximately **185,000** paper records (example: **184,669** in `services/evidence-pipeline/evidence.db`), with the latest ingest timestamp shown by the backend status response. The UI only presents the corpus as live when the status endpoint confirms available records, and each search result shows provenance and links **only** when returned by the evidence API.

Operational wording:

> This page searches the connected indexed evidence corpus when the backend status endpoint confirms available records. The exact corpus size is displayed from the live status endpoint rather than hard-coded.

**Distinction:** Local/dev corpus size may differ from production/preview — **always** cite **`GET /api/v1/evidence/status`** for the deployment you are demoing; avoid fixed “185k DB” marketing unless that environment’s status JSON agrees.

---

## Preview click-through log (DevOps)

_Agent environment:_ automated checks = `node --test` on Research Evidence tests + `vite build` + targeted `pytest` for evidence/library routers. **Manual preview URL exercise** (Netlify + Fly) requires org credentials — run locally per `CLAUDE.md` (`bash scripts/deploy-preview.sh`), then:

1. Open `?page=research-evidence` — confirm banners + source strip.
2. Toggle tabs — no console errors.
3. Evidence Search — brokered search as signed-in clinician (or expect 401 messaging).

## Tomorrow doctor-demo script

1. Open **Research Evidence** from the sidebar (`research-evidence`).
2. Read the **governance** card — controlled preview; no autonomous clinical decisions.
3. Point at **source strip**: Live API vs Bundled registry vs Demo preview vs offline hint.
4. If **red degraded banner** appears, explain bundled navigation-only rollups.
5. **Overview** — KPI subtitles (bundled vs live); wearables card explains scale honestly.
6. **Conditions & Comorbidity** — search; expand row → use Evidence Search for verified citations.
7. **Evidence Search** — run brokered query (e.g. depression rTMS); show empty-state honesty if index missing.
8. **Protocols & Devices** — show Live bundle panels **or** registry fallback banner.
9. **Labs / Meds / Diet** — adjunct-only framing; not indication by itself.
10. **Needs Review** — queue or honest empty; mention localStorage note.
11. Close: *Research Evidence helps clinicians review literature, governance gaps, and evidence coverage. It does not diagnose, prescribe, or replace clinician judgement.*

---

## Button/action matrix (detail)

| Label | Frontend handler | API / route | Expected behavior | Demo/bundled | Degraded | Tests |
|-------|------------------|-------------|-------------------|--------------|----------|-------|
| Sidebar **Research Evidence** | `app.js` → `loadResearchEvidence` → `pgResearchEvidence` | — | Renders page shell + tabs | Same | Same | route in `app.js` |
| **Overview** tab | `onclick` sets `_resEvidenceTab` + `_nav('research-evidence')` | Uses `getEvidenceUiStats` | KPIs + charts | Bundled subtitles when `!live` | Degraded banner | `pages-research-evidence.test.js` |
| **Conditions** tab | table expand `_reExpand` | registry + `CONDITION_EVIDENCE` | Expand directs to Evidence Search | Bundled counts | Same | grep tests |
| **Assessments** tab | card expand | `ASSESSMENT_REGISTRY` | Cards only | Static registry | Same | — |
| **Protocols & Devices** | `_ensureResearchBundleData` | research bundle endpoints | Live panels if `loaded` | `PROTOCOL_REGISTRY` fallback | Empty live panels hidden | wiring regressions |
| **Brain Targets** | filter/search | `BRAIN_TARGET_REGISTRY` | Table | Static | Same | — |
| **Labs / Meds / Diet** | `_ensureResearchBundleData` | adjunct endpoints | Adjunct disclaimer | Empty honest message | API unavailable | wiring regressions |
| **AI/ML** tab | button → search tab | — | No citation cards | Same | Same | — |
| **Evidence Search** tab | `renderEvidenceSearch` | library + evidence | Brokered search panel | Library auth note | 401/403/503 strings | `pages-research-evidence.test.js` |
| **Needs Review** | `renderNeedsReview` | optional `/literature-watch.json`; `curateLiteraturePaper` | Queue + KPIs | Legacy protos | Empty JSON message | — |
| Search boxes | `_reSearch`, `_nav` debounced | — | URL `q` synced | — | — | — |
| Topic chips (adjunct) | `_reOpenTab('adjunct',{topic})` | — | URL `topic` | — | — | — |
| Source badges | `_resSourceStrip` | — | Live / Bundled / Demo | — | Offline | — |
| **Protocol Studio** shortcut | `_nav('protocol-studio')` | — | Routed in `app.js` | — | — | — |
| **Handbooks** | `_nav('handbooks-v2')` | — | Routed | — | — | — |
| **Brain Map** | `_nav('brainmap-v2')` | — | Routed | — | — | — |
| **Assessments** | `_nav('assessments-v2')` | — | Routed | — | — | — |
| **Patients** | `_nav('patients-v2')` | — | Role-gated button vs message | — | — | — |
| **Biomarkers / Labs / Med / Nutrition** | `_nav(...)` | — | Routed | — | — | — |
| **Research export summary** | `_resExportEvidenceSummary` | `GET .../exports/summary` | Clinician-only toast | 401/403 message | Error text | manual |
| **External brokered search** | `_libExternalSearch` | `POST /api/v1/library/external-search` | FTS over ingest | Empty message | 401/403/503 | test grep |
| **Promote paper** | `_libPromoteExternal` | `POST .../promote-to-library` | Toast | Error mapping | Same | test grep |
| **AI draft** | `_libAiDraft` | `POST /api/v1/library/ai/summarize-evidence` | Draft card | — | Provider errors | test grep |
| **Curate literature** | `_litPaperAction` | `POST /api/v1/literature/papers/{pmid}/curate` | Toast; localStorage note | — | Toast error | — |
| **Coverage / safety / graph** | `renderProtocols` | bundle APIs | Labeled live slices | Registry fallback text | — | wiring |
| **Live FTS panel** | `renderLiveEvidencePanel` | `/api/v1/evidence/papers` etc. | Search or 503 panel | No fake rows | `live-evidence.js` | — |

---

## Evidence grades

Grades **A–E** in this workspace refer to **literature/evidence summaries** in the DeepSynaps grading scheme — not regulatory or prescription grades. Definitions and process: `docs/protocol-evidence-governance-policy.md`.
