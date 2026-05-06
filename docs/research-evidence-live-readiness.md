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

Bundled figures (e.g. ~87k papers in `evidence-dataset.js`) are **corpus metadata / orientation**, not a guarantee that this session’s database query returned that count.

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
| `searchEvidencePapers` | `GET /api/v1/evidence/papers` | `evidence_router` (`search_papers` — FTS over ingested SQLite corpus; clinician auth) |

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
| **Corpus availability banner** | `api.evidenceStatus()` → `GET /api/v1/evidence/status` — **`total_papers > 0`** ⇒ “Indexed evidence corpus available” + live count; **`0`** ⇒ unavailable banner (**do not** claim live 87k unless status reflects it) |
| **Live FTS panel** | `#re-live-evidence-host` → `renderLiveEvidencePanel()` → same `/api/v1/evidence/papers` stack |
| **Results UI** | Cards: PMID/DOI/open-access links **only if API returned values**; abstract snippet or “Abstract unavailable”; source badges per row (**Indexed corpus** / **Brokered indexed search** / curated) |

### Evidence Search demo gate (before doctor demo)

Before showing Research Evidence to a doctor, verify **at least one** is true:

1. The indexed evidence corpus is connected and Evidence Search returns **real** records with source/provenance, **or**
2. Brokered library search returns **real** literature links from the ingest, **or**
3. Curated library search returns **real** records and is clearly labelled **curated/fallback**.

If **none** are true, **do not** claim “searches our 87k evidence DB.” Say instead:

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
