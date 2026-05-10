# Evidence Terminal Implementation Summary

Date: 2026-05-10

## Executive Summary

The Research Evidence workspace was upgraded toward a real Neuromodulation Evidence Terminal without introducing fake corpus data, fake citations, or invented grades. The implementation adds a dedicated `/api/v1/evidence/terminal/*` backend surface, adapts the existing `research-evidence` page to consume that terminal API, preserves honest unavailable states, and keeps the existing evidence-router surfaces intact.

## Current Evidence DB Capabilities Detected

- canonical evidence DB path resolves to the neuromodulation v4 SQLite database in `services/evidence-pipeline`
- core tables available: `papers`, `indications`, `paper_indications`, `trials`, `trial_indications`, `protocols`, `paper_trial_links`, `devices`, `device_indications`
- FTS tables available: `papers_fts`, `trials_fts`
- computed indication grades available via `indications.computed_evidence_grade`

## Backend Endpoints Added Or Changed

Added:
- `GET /api/v1/evidence/terminal/status`
- `GET /api/v1/evidence/terminal/overview`
- `GET /api/v1/evidence/terminal/indications`
- `GET /api/v1/evidence/terminal/indications/{slug}`
- `GET /api/v1/evidence/terminal/papers/search`
- `GET /api/v1/evidence/terminal/papers/{paper_id}`
- `GET /api/v1/evidence/terminal/trials/search`
- `GET /api/v1/evidence/terminal/protocols/search`
- `GET /api/v1/evidence/terminal/network`
- `GET /api/v1/evidence/terminal/grade-distribution`

Compatibility aliases kept:
- `GET /api/v1/evidence/terminal/papers`
- `GET /api/v1/evidence/terminal/trials`
- `GET /api/v1/evidence/terminal/protocols`

Implementation notes:
- backend logic lives in `apps/api/app/services/evidence_terminal_service.py`
- schemas live in `apps/api/app/schemas/evidence_terminal.py`
- routes are mounted from `apps/api/app/routers/evidence_router.py`
- status is public and honest about DB absence
- data endpoints require clinician auth and raise `503` when the terminal DB is unavailable

## Frontend Dashboard Features Added

Added to `apps/web/src/pages-research-evidence.js`:
- terminal metric card deck on the overview surface
- terminal explorer panels fed by live terminal data plus existing research safety context
- denser search-side terminal results table
- local evidence basket panel using browser `localStorage`
- paper detail panel wired to terminal paper detail transport
- indication detail enhancement with terminal safety/meta panels

## Search Features Added

Added via `apps/web/src/api.js`:
- `getEvidenceTerminalStatus()`
- `getEvidenceTerminalOverview()`
- `getEvidenceTerminalIndications(params)`
- `getEvidenceTerminalIndication(indicationId)`
- `searchEvidenceTerminalPapers(params)`
- `getEvidenceTerminalPaperDetail(paperId)`
- `searchEvidenceTerminalTrials(params)`
- `searchEvidenceTerminalProtocols(params)`
- `getEvidenceTerminalNetwork(params)`
- `getEvidenceTerminalGradeDistribution()`

Page adapters also now route these higher-level helpers through the terminal API:
- `evidenceTerminalSnapshot()`
- `evidenceTerminalSearch()`
- `evidenceTerminalPaper()`
- `evidenceTerminalIndication()`

Adapter behavior:
- uses dedicated terminal endpoints first
- falls back to older evidence endpoints in stubbed/partial runtime environments
- preserves honest empty/unavailable states rather than fabricating results

## Charts And Visualisations Added

Added lightweight terminal visuals without a new charting dependency:
- terminal metric cards
- sparkline-style SVG mini chart
- dense result table
- safety tag pills
- terminal indication metadata panels

## Safety Disclaimers Added

Backend schema constants:
- “Evidence intelligence is for clinical/research decision support only. It does not diagnose, prescribe, or replace clinician judgement.”
- “Protocol links are extracted evidence relationships and require clinician verification before use.”
- “Computed evidence grades are decision-support signals derived from available database records and must be reviewed before clinical use.”

Frontend behavior:
- preserves existing governance banners
- keeps honest unavailable states
- marks basket as local-only and not a clinical approval list
- keeps paper detail/indication detail non-autonomous and source-linked

## Files Changed

Backend:
- `apps/api/app/routers/evidence_router.py`
- `apps/api/app/schemas/evidence_terminal.py`
- `apps/api/app/services/evidence_terminal_service.py`
- `apps/api/tests/test_evidence_terminal_router.py`

Frontend:
- `apps/web/src/api.js`
- `apps/web/src/pages-research-evidence.js`
- `apps/web/src/pages-research-evidence-frontend.test.js`
- `apps/web/src/pages-research-evidence.evidence.test.js`
- `apps/web/src/pages-research-evidence.test.js`
- `apps/web/src/research-evidence-search-rendering.test.js`

Docs:
- `docs/architecture/research-evidence-terminal-plan.md`
- `docs/architecture/neuromodulation-evidence-terminal.md`
- `docs/reports/evidence-terminal-implementation-summary.md`

## Tests Added

Added:
- `apps/api/tests/test_evidence_terminal_router.py`

Updated:
- `apps/web/src/pages-research-evidence-frontend.test.js`
- `apps/web/src/pages-research-evidence.evidence.test.js`
- `apps/web/src/pages-research-evidence.test.js`
- `apps/web/src/research-evidence-search-rendering.test.js`

## Commands Run And Results

- `python3 -m py_compile apps/api/app/services/evidence_terminal_service.py apps/api/app/schemas/evidence_terminal.py apps/api/app/routers/evidence_router.py apps/api/tests/test_evidence_terminal_router.py`
  - passed
- `apps/api/.venv/bin/pytest apps/api/tests/test_evidence_terminal_router.py -q`
  - `4 passed`
- `apps/api/.venv/bin/pytest apps/api/tests/test_evidence_router_indications.py -q`
  - `9 passed`
- `node --check apps/web/src/api.js`
  - passed
- `node --check apps/web/src/pages-research-evidence.js`
  - passed
- `node --test apps/web/src/pages-research-evidence.test.js apps/web/src/pages-research-evidence-frontend.test.js apps/web/src/research-evidence-search-rendering.test.js apps/web/src/pages-research-evidence.evidence.test.js`
  - `27 passed`
- `node --test apps/web/src/pages-research-evidence.runtime.test.js`
  - `13 passed`

Environment note:
- plain `pytest` at repo level failed in this shell because `slowapi` was missing outside the API venv, so API tests were rerun via `apps/api/.venv/bin/pytest`

## Known Limitations

- the frontend still blends terminal data with existing research-bundle/safety surfaces for some overview and indication side panels
- search-side device context still comes from the older evidence device endpoint because the dedicated terminal backend currently focuses on papers, trials, protocols, and network data
- terminal overview currently emphasizes indication-linked corpus structure rather than every auxiliary evidence-side table
- there are existing unrelated dirty files elsewhere in the repo that were intentionally left untouched

## Recommended Next PRs

1. Move the search-side device context into a dedicated terminal device projection or terminal overview extension.
2. Add a dedicated terminal paper-detail drawer test that exercises the new basket/detail rendering path end to end.
3. Add a stronger network visualization surface once the terminal node/edge contract is stable.
4. Consider moving the page’s terminal sub-renderers into smaller modules; `pages-research-evidence.js` remains large.
5. Add a terminal admin/health page for DB freshness, orphan protocols, and pipeline recency once operational requirements settle.
