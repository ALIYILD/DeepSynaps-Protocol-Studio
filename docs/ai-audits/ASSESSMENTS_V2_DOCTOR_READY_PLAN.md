## Assessments v2 Doctor-Ready Plan

### Mission scope (doctor-facing, licence-aware, audit-logged)
- Clinicians can **browse/search** an assessment library, see **condition relevance**, see **fillable/scorable** status, see **licence/external** requirements, **assign** to patients, track **queue/status**, **fill** supported assessments in-app, **score** supported assessments only when legally/clinically allowed, and link to **evidence** (local corpus + honest live status) with **AI suggestions** as decision-support (never diagnosis).

### Non‑negotiable safety/legal constraints
- **No copyrighted proprietary forms/manuals** unless the repo already contains licensed content with explicit `embedded_text_allowed=true`.
- **No fake scoring**: only score tools where scoring rules are implemented and permitted; otherwise show **manual/external/licence required** state.
- **No invented cutoffs, interpretations, references, or citations.**
- Always display **clinician review required** and **not diagnostic**.
- Always show limitations: **age range**, **informant type**, and **licence status**.
- **PHI protection**: do not emit PHI in logs/prompts/audit note fields; keep audit fields ID-only and bounded.
- **Tenant isolation**: cross-clinic access must be blocked using existing clinic gates.
- **Audit everything**: assign/fill/save/submit/score/view/export must produce audit events.

### Current state (discovery summary)
- **Web route exists**: `/?page=assessments-v2` → `pgAssessmentsHub()` in `apps/web/src/pages-clinical-hubs.js`.
- **API already has assessments infrastructure**: `apps/api/app/routers/assessments_router.py` supports templates (licensing-aware), assigning, listing, record CRUD, scoring validation, AI summary (safe fallback).
- **Evidence corpus already exists**: SQLite `evidence.db` via `apps/api/app/routers/evidence_router.py` (~87k rows). Live literature watch (PubMed) exists with honest adapter stubs for other sources.

### Execution plan (ordered)
#### 1) Route/preview reliability (web)
- Ensure `/?page=assessments-v2` renders a **non-indefinite** shell in preview/demo builds.
- Add stable selectors/testids required for e2e smoke and reviewer navigation:
  - `assessments-v2-root`, `assessments-library`, `assessments-queue`, `assessments-condition-map`, `assessments-evidence-panel`, `assessments-demo-banner`, `assessments-safety-banner`
  - tab ids: `assessments-library-tab`, `assessments-queue-tab`, `assessments-condition-map-tab`, `assessments-fill-score-tab`

#### 2) Canonical registry (metadata-only + licence-aware templates)
- Treat the API’s **template registry** as canonical for “fillable” tools.
- Build an **Assessment Registry V2** metadata endpoint set (or map existing `/api/v1/assessments/scales` and `/api/v1/assessments/templates`) into an `assessments-v2` shape without embedding restricted item text.
- Add tests ensuring no tool is marked fillable/scorable when licensing is restricted/unknown.

#### 3) Assignment + queue (tenant-isolated + audited)
- Reuse existing assessment record assignment flows, or add v2 endpoints that wrap them.
- Enforce cross-clinic blocking using existing `require_patient_owner(...)` gate.
- Ensure every state transition writes an audit event (ID-only payload).

#### 4) Fillable widget forms (schema-driven)
- Render templates from the API where `embedded_text_allowed=true`.
- For restricted instruments, render “external/licence required” or “score-entry only” UI—never show the items.
- Support draft autosave + submit; audit view/save/submit.

#### 5) Scoring (deterministic, versioned, audited)
- Use server-side canonical scoring (`assessment_scoring.py`) where available.
- For score-entry-only tools: accept clinician-entered totals/subscales, label as manual entry, and never infer diagnosis.
- Add tests: supported vs unsupported, incomplete responses, audit creation, non-diagnostic wording.

#### 6) Evidence linking (local corpus + honest live status)
- Leverage existing `/api/v1/evidence/*` endpoints for search and health.
- Add assessment-scoped evidence mapping in v2 with explicit `source_kind` (`corpus|library|live`) and honest “unavailable” handling if live is not configured.
- Tests: no fabricated DOI/PMID; missing live keys yields explicit fallback.

#### 7) AI recommendation (decision-support, PHI-redacted)
- Implement a recommendation endpoint that uses **registry + evidence retrieval** deterministically first, with LLM only to summarize (and only with PHI-redacted inputs).
- Enforce: no diagnosis, no proprietary scoring recommendations, include caveats + clinician review required.
- Tests: PHI redaction, deterministic fallback, no fake citations.

#### 8) UX polish (doctor-ready)
- Header: patient selector, global search, evidence health badge, AI suggest.
- Tabs: Library, Queue, Condition Map, Fill/Score, Evidence, AI Recommendations.
- Badges: fillable/scorable/licence/evidence grade.
- Ensure safety banner always visible.

#### 9) QA + release gates
- Add Playwright smoke for Assessments v2 route.
- Run existing lint/unit/build + targeted API tests for assessments/evidence security.
- Produce final doctor-ready report with honest readiness verdict and blockers.

