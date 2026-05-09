# Evidence Page DeepDive — Architecture Plan
**Task:** t_6d3dda03 · **Phase:** 1/4 Research + Architecture
**Date:** 2026-05-09
**Author:** coordinator (Hermes Agent)

---

## 1. Current State Findings

### 1.1 Evidence Database (v4 SQLite)
- **Path:** `services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db`
- **Record counts (confirmed via sqlite3):**
  - Papers: 184,670
  - Trials: 1,409
  - FDA devices: 48
- **Tables present:** papers, trials, devices, indications, paper_indications, trial_indications,
  protocols, paper_trial_links, neuromodulation_* (bundle tables), FTS indexes, schema_migrations
- **Schema is complete** — no migrations needed for Phase 2

### 1.2 Backend API
- **Evidence router:** `apps/api/app/routers/evidence_router.py` (2,850 lines)
- **Key endpoints:**
  - `GET /api/v1/evidence/status` — Returns real DB counts (not hardcoded). CORRECT.
  - `GET /api/v1/evidence/health` — Auth-gated health + DB path
  - `GET /api/v1/evidence/indications` — 29 indications from DB
  - `GET /api/v1/evidence/papers` — FTS search + filters, ranked
  - `GET /api/v1/evidence/papers/{id}` — Paper detail
  - `GET /api/v1/evidence/trials` — ClinicalTrials.gov studies
  - `GET /api/v1/evidence/devices` — FDA device records
  - `GET /api/v1/evidence/suggest` — Top papers+trials for a modality+indication pair
  - `POST /api/v1/evidence/papers/{id}/promote-to-library` — Save to doctor library
- **Status endpoint behaviour:** Returns zeros when DB absent (503 never thrown from /status).
  Honest degraded mode. CORRECT.

### 1.3 Frontend
- **Page:** `apps/web/src/pages-research-evidence.js` (3,258 lines)
- **Status helper:** `apps/web/src/evidence-ui-live.js` — calls `api.evidenceStatus()` which
  hits `/api/v1/evidence/status`. Correct wiring.
- **Corpus banner behaviour (lines 92-108):**
  - Shows red banner when `indexedCorpusAvailable` = false (i.e. status returns 0s)
  - Shows green/teal label when indexed corpus is live
  - DOES NOT hardcode paper counts in the banner itself
- **KPI strip (lines 511-513):**
  - `kpiPapers = liveEvidence?.totalPapers || EVIDENCE_TOTAL_PAPERS`
  - **ISSUE:** `EVIDENCE_TOTAL_PAPERS = 184669` is a hardcoded constant in `evidence-dataset.js`
    used as fallback when the API is unreachable. This is labelled "Bundled corpus metadata"
    with sub-text "These KPIs use bundled corpus metadata for orientation — not real-time database
    totals or verified primary counts." — The label is honest, but the number 184669 is
    hard-coded and will drift as the DB is updated.
- **Result cards (Evidence Search tab):**
  - PMID link rendered only when `paper.pmid` is present. CORRECT.
  - DOI link rendered only when `paper.doi` is present. CORRECT.
  - No fabricated identifiers found.
- **Empty/error states:** 
  - API failure → `corpusStatusBanner` shows amber "Indexed evidence corpus unavailable."
  - Auth failure on library overview → `libraryAuthNote` shown. CORRECT.

### 1.4 Evidence Pipeline (ingest sources)
- **Current sources (urllib-based, no OSS lib dependency):**
  - `pubmed.py` — E-utilities (esearch + efetch + XML parse), raw urllib
  - `semantic_scholar.py` — S2 Academic Graph API, raw urllib + JSON
  - `crossref.py` — Crossref REST API, raw urllib
  - `openalex.py` — OpenAlex API, raw urllib
  - `ctgov.py` — ClinicalTrials.gov API v2
  - `openfda.py` — FDA 510k/PMA/HDE
  - `unpaywall.py` — OA PDF links
- **NOT using:** pymed, habanero, biopython Entrez (approved OSS, not yet integrated)
- **Pipeline runs as standalone scripts** (not importable from API). The API is read-only from
  the SQLite DB.

### 1.5 Indication Coverage vs. Task Checklist
| Checklist Item | Indication Slug | Status |
|---|---|---|
| Depression rTMS | `rtms_mdd` | **EXISTS** in DB |
| ASD tDCS | — | **MISSING** — no tdcs_asd indication |
| ADHD neurofeedback | `nfb_adhd` | **EXISTS** in DB |
| Chronic pain TPS | — | **MISSING** — TPS only has tps_alzheimer; ESWT has eswt_crps_chronic_pain (different modality) |
| Alzheimer TPS | `tps_alzheimer` | **EXISTS** in DB |

### 1.6 Agent Brain Status
- `apps/api/app/services/agent_brain/providers/` exists but is empty (no provider files).
- No `/api/v1/agent-brain/status` or `/api/v1/agent-brain/providers` endpoints found in router list.
- Agent Brain is not yet wired for the evidence page — Phase 2/3 PR will need a
  `qeeg_knowledge` or `assessment` provider stub call from evidence search.

---

## 2. Gaps

### P0 — Correctness blockers
None found. The corpus banner, result cards, and empty states are all honest.

### P1 — Needed for go-live
1. **Missing indication: ASD tDCS** — `services/evidence-pipeline/indications_seed.py` has no
   `tdcs_asd` entry. Checklist search for "ASD tDCS" returns no results.
2. **Missing indication: Chronic pain TPS** — No `tps_chronic_pain` indication in seed or DB.
   TPS is evidenced primarily for Alzheimer's/MCI; chronic pain TPS is investigational (no FDA
   clearance). Must be seeded with honest regulatory note and broad_q.
3. **Hardcoded fallback constants drift** — `evidence-dataset.js` `EVIDENCE_TOTAL_PAPERS=184669`
   is a baked constant. When the DB is updated the banner label accurately says "bundled rollup"
   but the number goes stale. A CI step to regenerate this constant from the DB would fix drift.
4. **OSS adapters (pymed, habanero, biopython) not integrated** — Approved OSS from overnight
   sprint scout report. Current pipeline works via raw urllib but missing:
   - `pymed` (MIT): richer PubMed record structure, MeSH term access
   - `habanero` (MIT): Crossref polite-pool search with cursor pagination
   - `biopython Entrez` (BSD): Batch record fetch with automatic rate-limit handling
   These would improve recall and reduce custom parsing code.

### P2 — Polish
5. **Agent Brain wiring not present** — Evidence page should call
   `/api/v1/agent-brain/query` with provider `qeeg_knowledge` or `assessment` when available.
   Currently zero wiring.
6. **`EVIDENCE_TOTAL_TRIALS = 12840`** in evidence-dataset.js does not match DB count of 1,409.
   This is a large discrepancy. The bundled constant appears to be an older orientation rollup;
   the live API returns accurate counts. The label says "Bundled rollup" but the magnitude mismatch
   is potentially misleading if live API is down.

---

## 3. Class A + Class B Integration Plan (Tonight)

### Class A — UI/Safety/Wiring (no new API, no new OSS)

**A1: Add ASD tDCS indication seed** (30 min)
- File: `services/evidence-pipeline/indications_seed.py`
- Add `tdcs_asd` entry with:
  - `evidence_grade = "C"` (investigational; sparse RCT evidence)
  - `regulatory = "No FDA clearance for ASD. Class II tDCS devices exist for other indications."`
  - `pubmed_q` = `(tDCS[Title/Abstract] OR "transcranial direct current stimulation"[Title/Abstract]) AND (autism[Title/Abstract] OR ASD[Title/Abstract] OR "autism spectrum"[Title/Abstract])`
  - `broad_q` = `"transcranial direct current stimulation" autism`
  - `trial_q` = `tDCS autism`
- Run `python3 ingest.py --indication tdcs_asd` to populate DB

**A2: Add TPS chronic pain indication seed** (30 min)
- Add `tps_chronic_pain` entry with:
  - `evidence_grade = "D"` (experimental; very limited data)
  - `regulatory = "Investigational. Storz Neurolith CE-marked for Alzheimer's only (2018). No FDA clearance for chronic pain."`
  - `pubmed_q` = `("transcranial pulse stimulation"[Title/Abstract] OR TPS[Title/Abstract]) AND ("chronic pain"[Title/Abstract] OR neuropathic[Title/Abstract])`
  - `broad_q` = `"transcranial pulse stimulation" "chronic pain"`
  - `trial_q` = `transcranial pulse stimulation pain`

**A3: Fix EVIDENCE_TOTAL_TRIALS fallback constant** (15 min)
- File: `apps/web/src/evidence-dataset.js` line 11
- Change `EVIDENCE_TOTAL_TRIALS = 12840` to `EVIDENCE_TOTAL_TRIALS = 1409`
  (matches current v4 DB count; label already says "Bundled rollup" so semantics are honest)
- Add inline comment explaining source

### Class B — New APIs / DB Migrations / OSS Adapters

**B1: pymed adapter for enriched PubMed records** (2 hr)
- New file: `services/evidence-pipeline/sources/pubmed_pymed.py`
- Wraps `pymed.PubMed` (MIT) to retrieve MeSH terms, grant IDs, structured author affiliations
- Adds a `mesh_terms_json` column to papers table (Alembic migration `005_add_mesh_terms.py`)
- The existing `pubmed.py` adapter stays as fallback; `pubmed_pymed.py` is an optional enrichment path
- Ingest flag: `--enrich-mesh` triggers pymed enrichment pass
- No paid API; NCBI E-utilities rate-limited correctly (0.11s delay with API key)

**B2: habanero Crossref polite-pool adapter** (1 hr)
- New file: `services/evidence-pipeline/sources/crossref_habanero.py`
- Replaces manual offset pagination in `crossref.py` with `habanero.Crossref` cursor pagination
- Improves recall for systematic reviews (crossref has better meta-analysis coverage than PubMed)
- License: MIT. No API key required (polite pool uses email)

**B3: biopython Entrez batch fetcher** (1 hr)
- New file: `services/evidence-pipeline/sources/pubmed_bio.py`
- Uses `Bio.Entrez.efetch` with `rettype=xml` for batch PMID fetches
- Reduces round-trips vs current one-batch-per-200 approach
- License: BSD-3-Clause. Approved.

**B4: Agent Brain stub for evidence page** (1 hr)
- When `GET /api/v1/agent-brain/status` is available and provider `assessment` is configured,
  the Evidence Search frontend should append agent-brain context to search results
- Frontend change: `apps/web/src/pages-research-evidence.js` — add
  `<div id="agent-brain-status">` mount point + `mountAgentBrainStatus()` call on tab render
- Backend: No new endpoints needed yet — wiring uses existing `/api/v1/agent-brain/query`
  when available (optional call, degrades gracefully if not configured)

---

## 4. Exact API Endpoints Needed

No new API endpoints needed for Phase 2 (Class A fixes). The existing endpoints are sufficient.

For Phase 3+ (OSS enrichment), one new endpoint:
- `GET /api/v1/evidence/papers/{id}/mesh-terms` — returns MeSH terms for a paper (B1)
  - Response: `{ pmid: string, mesh_terms: string[] }`
  - DB-backed from `mesh_terms_json` column (added by Alembic migration 005)

---

## 5. DB Schema Changes

### Migration 005 (only if B1 is done in Phase 2/3)
```sql
-- Alembic migration: 005_add_mesh_terms
ALTER TABLE papers ADD COLUMN mesh_terms_json TEXT DEFAULT NULL;
-- JSON array of MeSH term strings. NULL when not yet enriched.
-- Populated by services/evidence-pipeline/sources/pubmed_pymed.py --enrich-mesh
```
No other schema changes required. Indications table is populated at runtime via ingest.py.

---

## 6. Frontend Components Needed

### F1: Agent Brain Status Mount (Phase B4)
```html
<!-- Inside evidence search tab header, after corpusStatusBanner -->
<div id="agent-brain-status" aria-live="polite"></div>
```
```js
// In renderEvidenceSearch(), after corpusStatusBanner is rendered:
if (typeof mountAgentBrainStatus === 'function') {
  mountAgentBrainStatus(document.getElementById('agent-brain-status'), {
    page: 'evidence',
    providers: ['assessment'],
  });
}
```

### F2: Indication filter update (Phase A1 + A2)
- After indications seed + ingest run, `GET /api/v1/evidence/indications` will return
  `tdcs_asd` and `tps_chronic_pain` automatically
- The frontend indication filter dropdown is dynamically populated from this endpoint
- No frontend code change needed — dropdown updates automatically

---

## 7. Tests to Write (Phase 2)

| Test | File | What it tests |
|---|---|---|
| `test_evidence_status_no_db` | `apps/api/tests/test_evidence_router.py` | Returns 200 with zeros when DB absent (not 500/503) |
| `test_evidence_status_live` | `apps/api/tests/test_evidence_router.py` | Returns actual counts from v4 DB |
| `test_tdcs_asd_indication_present` | `services/evidence-pipeline/tests/test_indications.py` | tdcs_asd slug exists in SEED |
| `test_tps_chronic_pain_indication_present` | `services/evidence-pipeline/tests/test_indications.py` | tps_chronic_pain slug exists in SEED |
| `test_result_card_no_fake_pmid` | `apps/web/tests/evidence-search.spec.js` | Result cards do not render PMID when paper.pmid is null |
| `test_corpus_banner_honest_empty` | `apps/web/tests/evidence-search.spec.js` | Corpus banner shows amber warning when status returns 0 |
| `test_corpus_banner_live_count` | `apps/web/tests/evidence-search.spec.js` | Corpus banner shows teal badge when status returns >0 |

---

## 8. Evidence-DB Queries Needed

### Verify indications after ingest
```sql
SELECT slug, label, modality, evidence_grade, regulatory
FROM indications
WHERE slug IN ('tdcs_asd', 'tps_chronic_pain')
ORDER BY slug;
```

### Verify papers linked to ASD tDCS indication after ingest
```sql
SELECT COUNT(*) as paper_count
FROM paper_indications pi
JOIN indications i ON i.id = pi.indication_id
WHERE i.slug = 'tdcs_asd';
```

### Check trials connected to TPS chronic pain
```sql
SELECT COUNT(*) as trial_count
FROM trial_indications ti
JOIN indications i ON i.id = ti.indication_id
WHERE i.slug = 'tps_chronic_pain';
```

---

## 9. Phase Breakdown

| Phase | Task | Class | Est. | Owner |
|---|---|---|---|---|
| 1 (this) | Research + architecture plan | Planning | Done | coordinator |
| 2 | A1: tdcs_asd seed + ingest | Class A | 45 min | evidence-worker |
| 2 | A2: tps_chronic_pain seed + ingest | Class A | 45 min | evidence-worker |
| 2 | A3: Fix EVIDENCE_TOTAL_TRIALS constant | Class A | 15 min | evidence-worker |
| 3 | B1: pymed enrichment adapter + Alembic 005 | Class B | 2 hr | evidence-worker |
| 3 | B2: habanero Crossref adapter | Class B | 1 hr | evidence-worker |
| 3 | B3: biopython Entrez fetcher | Class B | 1 hr | evidence-worker |
| 4 | B4: Agent Brain status mount | Class B | 1 hr | evidence-worker |
| 4 | All tests (F1-F7 from section 7) | Testing | 1.5 hr | evidence-worker |

---

## 10. Hard Rules Compliance

- No fabricated clinical content in this plan.
- ASD tDCS and TPS chronic pain both flagged as Grade C/D investigational with explicit
  regulatory statements — not claimed as approved indications.
- OSS: pymed (MIT), habanero (MIT), biopython (BSD-3) — all on approved list per
  `hermes:coordinator:overnight-sprint-2026-05-08:scout`.
- No paid APIs. No Class C work (autonomous prescribing, heavy model deploy).
- Agent Brain wiring is additive and degrades gracefully if providers not configured.

---

## 11. Confidence

| Finding | Confidence |
|---|---|
| Evidence DB is live and populated (184K papers) | High — verified via sqlite3 |
| /api/v1/evidence/status returns honest counts | High — code read |
| Result cards show PMID/DOI only when present | High — code read |
| EVIDENCE_TOTAL_TRIALS constant mismatch (12840 vs 1409) | High — verified via sqlite3 + code |
| ASD tDCS indication missing from seed | High — verified grep + sqlite3 |
| TPS chronic pain indication missing | High — verified grep + sqlite3 |
| OSS libs not yet integrated in pipeline | High — grep confirms raw urllib usage |
| Agent Brain providers empty | High — ls confirms empty providers dir |
