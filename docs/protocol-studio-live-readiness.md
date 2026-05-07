# Protocol Studio — live doctor-demo readiness

This document scopes **DeepSynaps Protocol Studio** for clinician demos: **evidence review, comparison (deterministic ranking), and clinician-supervised draft generation only**. It does **not** diagnose, prescribe, approve treatment, triage emergencies, operate autonomously, or fabricate literature.

---

## Canonical demo path

1. Open **Protocol Studio** (`protocol-studio`, `protocol-hub`, or legacy `protocols` → Browse tab).
2. Read the **controlled preview** safety banner at the top.
3. **Browse** — search a condition (e.g. depression / ASD / ADHD / chronic pain); filter by modality, evidence, governance, population, literature presence.
4. Open **Evidence** tab — evidence **health**, **local corpus search** (honest empty state if DB absent), **registry catalog**, **patient context** (when patient selected).
5. Open a protocol — **View evidence** / detail — grades, refs or explicit “unavailable” messaging.
6. **Generate** — evidence-based draft (`POST /api/v1/protocol-studio/generate`).
7. Select a **demo patient** — retry **qEEG/MRI-guided** or **personalised** modes; expect **missing-data** responses when imaging/DeepTwin rows are absent (by design).
8. **Compare / Ranking** — `POST /api/v1/protocol-studio/recommend` — review **top 3** and ranking disclaimer.
9. **DeepTwin Simulation** tab — `POST /api/v1/protocol-studio/simulate` returns **`available: false`** with explicit copy (no fabricated predictions in this preview surface).
10. **My Drafts** — `GET /api/v1/protocols/saved` or degraded message.

---

## Required safety copy (UI + API)

**Controlled preview**

> This is a controlled preview using synthetic or clinician-provided data where applicable. Protocol Studio supports evidence review and clinician-supervised draft generation only. It does not diagnose, prescribe, approve treatment, triage emergencies, or act autonomously. All outputs require clinician review.

**Ranking**

> Protocol rankings are decision-support summaries based on available registry/evidence data. They are not treatment orders and do not replace clinical judgement.

**DeepTwin simulation**

> DeepTwin simulation is a what-if modelling aid. It is not a validated clinical outcome prediction, diagnosis, or treatment approval.

**Simulation unavailable (API)**

> Simulation engine is not available in this build. No clinical prediction has been made.

---

## Tab-by-tab matrix

| Tab | Purpose | Primary UI | Backend / API | Degraded behaviour |
|-----|---------|------------|---------------|---------------------|
| Conditions | Condition-led entry | Condition grid from curated data | — | Guest: browse-only banner |
| Browse | Protocol intelligence browser | `pages-protocols.js` embedded search | `GET /api/v1/registry/protocols` merged with curated library | Backend offline: curated-only |
| Evidence | Corpus + catalog + patient context | Evidence health, search, catalog panels | `GET …/evidence/health`, `GET …/evidence/search`, `GET …/protocols`, `GET …/patients/{id}/context` | No evidence DB: empty search + message |
| Generate | Draft generators | Evidence / qEEG-MRI / personalised cards | `POST …/protocol-studio/generate` | Missing patient/imaging/DeepTwin: `needs_more_data` / blocked states |
| Compare | Deterministic ranking | Form + top 3 | `POST …/protocol-studio/recommend` | HTTP/error → unavailable panel |
| Simulation | What-if preview | Status + checklist | `POST …/protocol-studio/simulate` | Always `available: false` in Protocol Studio preview build |
| My Drafts | Saved drafts | List | `GET /api/v1/protocols/saved` | Error → “Saved drafts unavailable in this environment.” |

---

## Button / action matrix (abbrev.)

| Label | Handler | API | Expected |
|-------|---------|-----|----------|
| Tab buttons | `window._psTab` | — | Switches tab content |
| Evidence search Run | `_psRunEvidenceSearch` | `protocolStudioEvidenceSearch` → `GET …/evidence/search` | Rows or unavailable |
| Generate (evidence) | `_psGenerateEvidence` | `protocolStudioGenerate` | Draft or insufficient/blocked |
| Generate (guided) | `_psGenerateBrainScan` | `protocolStudioGenerate` (`qeeg_guided` / `mri_guided`) | Needs patient + imaging rows |
| Generate (personalised) | `_psGeneratePersonalized` | `protocolStudioGenerate` (`deeptwin_personalized`) | Needs patient + DeepTwin rows when applicable |
| Run deterministic ranking | `_psRunRecommendRank` | `protocolStudioRecommend` → `POST …/recommend` | Ranked groups + `overall_top_3` |
| Simulation tab load | `_renderSimulation` | `protocolStudioSimulate` → `POST …/simulate` | `available: false` + message |
| My Drafts refresh | `_renderDrafts` | `listSavedProtocols` / `protocolsSaved` → `GET …/protocols/saved` | List or error panel |

---

## API endpoints (Protocol Studio namespace)

| Method | Path | Notes |
|--------|------|------|
| GET | `/api/v1/protocol-studio/evidence/health` | Clinician+ |
| GET | `/api/v1/protocol-studio/evidence/search` | Local corpus only; honest unavailable |
| GET | `/api/v1/protocol-studio/protocols` | Registry catalog + safety fields |
| GET | `/api/v1/protocol-studio/protocols/{id}` | Detail |
| GET | `/api/v1/protocol-studio/patients/{id}/context` | Clinic scope |
| POST | `/api/v1/protocol-studio/generate` | Deterministic; no LLM |
| POST | `/api/v1/protocol-studio/recommend` | Deterministic ranking |
| POST | `/api/v1/protocol-studio/simulate` | Preview: no prediction payload |

---

## Evidence database status

- Search uses **`evidence_rag`** against a **local SQLite path** resolved at runtime (`EVIDENCE_DB_PATH` / defaults). If the file is missing, the API returns **`status: unavailable`** and the UI shows an honest empty state — **no invented PMIDs/DOIs**.
- Protocol cards show **cited ref counts** when the curated library includes `references`; otherwise messaging indicates links are unavailable in-environment.

---

## Preview / env (reference)

- `VITE_ENABLE_DEMO=1` — demo auth paths for reviewers.
- `VITE_API_BASE_URL` — API origin for web builds.
- CORS: `DEEPSYNAPS_CORS_ORIGINS` must include the web origin.

**Preview click-through:** Not executed in this agent runtime (no Node/pytest toolchain in PATH). Run locally:

```bash
cd apps/api && python3 -m pytest -q tests/test_protocol_studio_router.py
cd apps/web && node --test src/protocol-studio-route.test.js src/protocol-studio-ux.test.js src/protocol-studio-readiness.test.js
cd apps/web && npm run build
```

---

## Tomorrow’s doctor-demo script (verbatim flow)

1. Open Protocol Studio.  
2. Point out **controlled preview** banner.  
3. Search condition: depression / ASD / ADHD / chronic pain.  
4. Filter by modality / evidence / literature.  
5. Open one evidence-backed protocol; show grade + refs or explicit unavailable.  
6. Generate **evidence-based** draft.  
7. Select **demo patient**.  
8. Try **qEEG/MRI-guided** — show **missing-data** if no rows.  
9. Try **personalised** — same.  
10. **Compare** — show **top 3** + ranking disclaimer.  
11. **Simulation** tab — show **unavailable** message (no fake prediction).  
12. **My Drafts**.  
13. Close with: *Protocol Studio helps clinicians search evidence, compare options, and generate reviewable drafts. It does not prescribe, diagnose, or replace clinician judgement.*

---

## Known limitations

- **Protocol Studio simulate** does not embed DeepTwin physics — use the dedicated DeepTwin workspace for governed simulations when enabled by ops (`enable_deeptwin_simulation`).
- **Ranking** uses registry CSV fields + deterministic weights — not a randomized trial substitute.
- **Guest** users cannot call protected generator endpoints.
