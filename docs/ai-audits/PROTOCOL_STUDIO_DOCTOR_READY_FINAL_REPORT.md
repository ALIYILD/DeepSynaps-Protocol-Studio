# Protocol Studio Doctor-Ready Final Report

## Executive Verdict

- **Doctor-ready**: **Partial (Phase 1 facades shipped; Phase 2 deterministic drafts shipped; approval/export still missing)**
- **Preview-ready**: **Yes for browsing/search/status/context** (requires clinician auth; evidence corpus depends on API host ingest)
- **Production clinical ready**: **No** (drafts are decision-support only; no review/approval workflow + no export yet)
- **Remaining blockers**:
  - Review/approve/reject workflow with role gating + off-label acknowledgement + research-only block
  - Export workflow with PHI-safe audit + retention
  - Evidence DB ingest availability on target API host (local SQLite `evidence.db` / vector optional)

## Route / Preview

- **URL**: `/?page=protocol-studio`
- **route status**: Routed to `pgProtocolHub` via `apps/web/src/app.js` (query-param router).
- **offline/demo state**: UI shows honest unavailable/fallback states; no fake literature or approvals.
- **API connectivity**: Uses `/api/v1/protocol-studio/`* facades (requires clinician auth).

## Evidence Database

- **local evidence**: Uses local SQLite evidence corpus when present on API host (via `app.services.evidence_rag`). If missing, returns `status="unavailable"` with empty results.
- **87k corpus**: Not assumed; no counts are fabricated.
- **live literature**: Not queried at request time; health reports “configured” only (env presence), not availability.
- **fallback mode**: `local_only` when corpus present; otherwise `unavailable` (no fake keyword fallback results).
- **tests**: `apps/api/tests/test_protocol_studio_router.py` covers health + “unavailable is honest” behavior.

## Protocol Generation Modes

Phase 2 adds **deterministic** draft generation (no LLM). Drafts are always **decision-support only** and require clinician review.


| mode                  | data used                        | evidence grounding | safety status         | tested               |
| --------------------- | -------------------------------- | ------------------ | --------------------- | -------------------- |
| evidence_search       | registry + local evidence search | local-only         | draft_requires_review | yes (API + UI wiring) |
| qeeg_guided           | patient qEEG availability only   | local-only         | needs_more_data gating | yes (API)            |
| mri_guided            | patient MRI availability only    | local-only         | needs_more_data gating | yes (API)            |
| deeptwin_personalized | patient DeepTwin availability only | local-only       | needs_more_data gating | yes (API)            |
| multimodal            | qEEG+MRI+DeepTwin availability (>=2) | local-only     | needs_more_data gating | yes (API)            |


## Patient Context

- **qEEG**: Availability/count + last_updated (no raw data)
- **MRI**: Availability/count + last_updated (no raw report)
- **ERP**: Not aggregated yet (reported as missing)
- **DeepTwin**: Availability/count via `deeptwin_analysis_runs` (no simulations/notes yet)
- **assessments**: Availability/count + last_updated
- **medications/confounds**: Not aggregated yet (reported as missing)
- **missing data**: Returned as list
- **completeness score**: Returned (0–1, based on source availability)
- **PHI safety**: Response omits names/DOB; audit notes are bounded and structured.

## Safety / Governance

- **off-label**: Protocol catalog conservatively flags off-label and always includes an explicit warning.
- **contraindications**: Catalog surfaces registry contraindication summary; patient context surfaces clinician-entered structured safety flags when present.
- **review/approval**: Not implemented in this phase; UI “Clinician review & sign-off…” remains informational and does not assert approval.
- **audit**: Thin facades write PHI-safe audit events to `audit_events`.

## Frontend UX

- **search**: Evidence search form + results list (local corpus only; honest messaging)
- **catalog**: Registry-backed protocol catalog list with off-label warnings and refs summary
- **patient context**: Right-side panel showing availability and safety flags
- **safety banner**: Preserved; tests guard wording
- **generation (evidence mode)**: Enabled to call `POST /api/v1/protocol-studio/generate` and render structured draft output; other modes remain disabled
- **approval**: Still disabled (no review workflow yet)

## AI Safety

- **PHI redaction**: No LLM calls in this phase; no prompt assembly.
- **grounding**: Evidence search is local-only; no invented citations.
- **fake citation rejection**: Not applicable yet (no LLM narrative).
- **fallback**: Evidence endpoints return `unavailable` with empty results when corpus missing.

## Tests


| command                                                                    | result      | notes                                                                         |
| -------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `python3 -m pytest apps/api/tests/test_protocol_studio_router.py -q`       | pass        | validates generate statuses, off-label gating, cross-clinic gate, audit event |
| `cd apps/web && node --test src/protocol-studio-ux.test.js`                | pass        | validates selectors, safety wording, and “generation disabled” messaging      |
| `cd apps/web && npm run test:unit`                                         | pass        | ran in this VM                                                                |
| `cd apps/web && npm run build`                                             | **not run** | requires Node 20.19+ (Vite 7); VM had Node 18                                 |


## Deployment

- **Netlify**: Preview build uses `VITE_ENABLE_DEMO=1`; Protocol Studio is clinician workspace and requires auth.
- **Fly API**: Must have evidence corpus ingested for evidence search to return results; otherwise returns honest unavailable.
- **env vars**: Evidence health reports “live configured” based on env presence; does not call external APIs.
- **CI**: Not evaluated here beyond unit tests.
- **rollback**: Changes are additive (new router + UI wiring); removal is safe.

## Remaining Work (prioritized)

1. **Safety blocker**: implement review/approve/reject workflow + off-label acknowledgement and research-only blocks.
2. **Evidence blocker**: add evidence health counts/last-ingest safely (no fake numbers) and ensure host ingest steps documented/automated.
3. **Generation next**: deepen patient-context integration (actual qEEG/MRI/DeepTwin summaries, contraindication checks) beyond availability-only gating.
4. **UX improvement**: Protocol detail panel (open protocol) should render a safe detail drawer instead of toast-only.
5. **Future research feature**: live-only retrieval mode and RAG augmentation with strict provenance tagging and budget/rate control.