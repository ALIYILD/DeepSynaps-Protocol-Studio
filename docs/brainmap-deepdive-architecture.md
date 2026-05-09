# Brain Map Planner DeepDive — Architecture & Implementation Plan
## Phase 1/4: Research + Architecture + Planning

**Task ID:** t_788a12d7  
**Date:** 2026-05-09  
**Profile:** protocol-studio  
**Status:** Research Complete → Architecture Design  

---

## Executive Summary

Brain Map Planner v2 is **functionally complete** on the frontend (as of stabilization run t_facf1511):
- ✓ Planning report block (`data-testid="bmp-planning-report"`) with readiness checklist
- ✓ JSON export includes `planning_report` metadata
- ✓ PDF sections for patient context, target, protocol, parameters, qEEG fit, planning report, disclaimers
- ✓ Readiness score = input completeness (NOT efficacy)
- ✓ No fake FEM/neuronavigation (E-field labeled qualitative geometry only)
- ✓ All 9 verification gates PASSED

**This DeepDive Phase 1 scopes the **backend integration** and **API layer** needed to:**
1. Make the planning report data **persistent** (backend store for retrospective audit)
2. Enable **institutional governance workflows** (export to compliance/review systems)
3. Support **protocol library lookups** via REST instead of fallback data
4. Unlock **qEEG Analyzer bridge** (backend suggests protocols based on analysis)

---

## Current State Analysis

### Frontend (pages-clinical-tools.js + pages-brainmap.js)

| Component | Status | Details |
|-----------|--------|---------|
| Brain Map Planner main UI | ✓ Complete | Tabs: Clinical (default) · Montage · Research |
| Planning report panel | ✓ Complete | `data-testid="bmp-planning-report"` at line 7921; readiness checklist, capabilities/improvements list |
| JSON export (`_bmpExportPlanJSON`) | ✓ Complete | Calls `_bmpBuildPlanArtifact()` → `_bmpBuildPlanningReportMeta()` → blob download |
| PDF export (via print-to-PDF) | ✓ Complete | Print media query includes all sections |
| SVG brain map (10-20 montage) | ✓ Complete | Delegated event handlers on clickable sites |
| Readiness scoring | ✓ Complete | Input-based: patient linked? target + anchor? protocol OR params? qEEG bridge? |
| Demo banner + safety footer | ✓ Complete | 4 clinical disclaimers + 1 demo-stamp notice |

### Backend (Non-existent; to be created)

| Component | Status | Details |
|-----------|--------|---------|
| `brainmap_router.py` | ✗ Missing | REST endpoints for plan persistence, protocol lookups, audit logging |
| DB schema (plans, audits) | ✗ Missing | Alembic migration needed |
| `BrainMapPlan` Pydantic model | ✗ Missing | Schema for POST /plans, GET /plans/{id} |
| Protocol library adapter | ✗ Missing | Query condition + target region → suggest protocols from DB |
| qEEG protocol-fit service | ✗ Missing | Already exists: `qeeg_protocol_fit.py::suggest_protocols_from_report()` |

---

## Integration Scope: Class A + Class B

### Class A (UI / Safety / Wiring) — Already Done
- ✓ Planning report UI component (readiness checklist, capabilities, roadmap)
- ✓ JSON schema for `planning_report` export metadata
- ✓ Disclaimers on page and in export
- ✓ Demo banner + audit logging hooks
- ✓ Safety gates (no fake FEM, no autonomous prescribing)

### Class B (New APIs, DB Migrations, Licensed Adapters) — This DeepDive

#### 1. Planning Report Persistence
**Endpoints:**
- `POST /api/v1/brain-map/plans` — Create a planning report (user-facing, gated to clinician role)
  - Input: `_bmpBuildPlanArtifact()` payload (patient_id, region, anchor, protocol, parameters, etc.)
  - Output: `{ plan_id, created_at, created_by, status: 'draft' }`
  - Safety: Requires auth token + role check (clinician/supervisor)
  - Audit: Log to `audit_trail` table with `surface: 'brain_map_planner'`, `action: 'plan_create'`
  
- `GET /api/v1/brain-map/plans/{plan_id}` — Retrieve a saved plan (read-only, with audit gate)
  - Output: Full `BrainMapPlan` JSON
  - Audit: Log read event
  
- `GET /api/v1/brain-map/plans?patient_id=<id>&limit=50` — List patient's plans
  - Pagination support
  - Audit: Log query

- `PATCH /api/v1/brain-map/plans/{plan_id}` — Update status (draft → approved, archived, etc.)
  - Gated: Only creator or supervisor can update
  - Audit: Log transition

**DB Schema (Alembic migration):**
```sql
CREATE TABLE brain_map_plans (
  id UUID PRIMARY KEY,
  patient_id VARCHAR(255),  -- nullable for demo/draft plans
  created_by VARCHAR(255) NOT NULL,  -- user_id from auth token
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'draft',  -- draft | approved | archived
  region VARCHAR(100),  -- e.g., 'DLPFC-L'
  target_anchor VARCHAR(10),  -- e.g., 'F3'
  protocol_id VARCHAR(255),  -- from catalog if selected
  protocol_name VARCHAR(255),
  intensity_ma FLOAT,  -- manual or from protocol
  frequency_hz FLOAT,
  session_duration_min INT,
  num_sessions INT,
  qeeg_analysis_id VARCHAR(255),  -- link to QEEGAnalyzer analysis if present
  analyzer_fit JSONB,  -- full `_bmpAnalyzerFit` payload from bridge
  demo_stamp BOOLEAN DEFAULT FALSE,
  full_artifact JSONB NOT NULL,  -- Store the entire export JSON for audit trail
  notes TEXT,  -- Clinician notes
  INDEX patient_id_idx (patient_id),
  INDEX created_by_idx (created_by),
  INDEX status_idx (status)
);

CREATE TABLE brain_map_plan_audit (
  id BIGSERIAL PRIMARY KEY,
  plan_id UUID REFERENCES brain_map_plans(id),
  actor_id VARCHAR(255),
  action VARCHAR(50),  -- 'create', 'read', 'update', 'archive', 'export_json', 'export_pdf'
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB,  -- { filename, ip, reason, etc. }
  INDEX (plan_id, timestamp)
);
```

#### 2. Protocol Library Query Endpoint
**Purpose:** Support the `Research` tab + suggestion overlays with live protocol lookups instead of fallback data.

**Endpoint:**
- `GET /api/v1/brain-map/protocols?target_region=<code>&modality=tDCS&limit=50` — List protocols matching target + modality
  - Queries existing `protocols` table (if populated via evidence DB)
  - Returns: `[ { id, name, indication, anode, cathode, evidence_grade, ... } ]`
  - Falls back to empty `[]` if DB unavailable (UI renders fallback data)
  - Audit: Optional (read-only, high volume)

**Implementation:**
- Reuse existing protocol query from Protocol Studio router: `apps/api/app/routers/protocols_router.py`
- Add query filters: `target_region`, `modality_id`, `limit`
- No new DB table (queries existing `protocols`, `protocol_parameters`, `evidence` joins)

#### 3. qEEG Protocol-Fit Bridge (Already Exists)
**Status:** `apps/api/app/services/qeeg_protocol_fit.py::suggest_protocols_from_report()` already implemented.

**Integration point (frontend):**
- On-page: Button "Open qEEG Analyzer" in planning report (links to `/page/qeeg-analyzer`)
- When analyzer context is active in-session (`_bmpQEEGAnalysisId`), Brain Map Planner:
  1. Fetches analyzer report via `api.getQEEGReport(analysisId)`
  2. Calls `api.suggestProtocolsFromQEEGReport(report)` → backend
  3. Backend runs `suggest_protocols_from_report(report)` → returns ranked protocols
  4. Frontend overlays on map as "Analyzer suggested"

**Endpoint (already exists or needs wiring):**
- `POST /api/v1/qeeg/suggest-protocols` — Accept QEEGBrainMapReport, return protocol suggestions
  - Input: `{ dk_atlas: [...], patient_info: {...}, ... }` (QEEGBrainMapReport contract)
  - Output: `[ { protocol_id, score, explanation, z_scores_matched: [...] } ]`
  - Audit: Log to `audit_trail` with `surface: 'qeeg_protocol_fit'`

---

## Implementation Plan (Phases 2–4)

### Phase 2: Backend Setup (brainmap_router.py + DB migration)
- [ ] Create `apps/api/app/routers/brainmap_router.py` with endpoints listed above
- [ ] Create Alembic migration: `versions/2026_05_09_brainmap_tables.py`
- [ ] Define Pydantic models: `BrainMapPlan`, `BrainMapPlanCreate`, `BrainMapPlanAudit`
- [ ] Add auth guards (clinician/supervisor role)
- [ ] Write backend tests (pytest): 6–10 test cases covering CRUD, audit, role gates

### Phase 3: Frontend-Backend Wiring
- [ ] Update `apps/web/src/api.js` with new methods:
  - `api.createBrainMapPlan(artifact)` → POST
  - `api.getBrainMapPlan(planId)` → GET
  - `api.listBrainMapPlans(patientId)` → GET
  - `api.listBrainMapProtocols(target, modality)` → GET (reuse from Protocol Studio)
  - `api.suggestProtocolsFromQEEGReport(report)` → POST (call qeeg_protocol_fit backend)
  
- [ ] Update `apps/web/src/pages-clinical-tools.js`:
  - Replace fallback data fetch in `_loadBrainMapEvidenceBundle()` with API calls
  - Add "Save plan" button → calls `api.createBrainMapPlan(_bmpBuildPlanArtifact())`
  - On save success, show plan_id + timestamp in UI
  - Add qEEG bridge button → `api.suggestProtocolsFromQEEGReport()`

- [ ] Write frontend tests: 4–6 cases (API success, error, fallback)

### Phase 4: E2E Demo + Governance Integration (Stretch)
- [ ] End-to-end test: Create plan via UI → verify in DB → audit trail visible
- [ ] Print-to-PDF now includes plan_id + timestamp in header
- [ ] Export JSON now includes `plan_id` + backend URL for retrieval
- [ ] (Stretch) Export to compliance hub: Add webhook to external audit system when plan created

---

## Technical Decisions

### 1. JSON Storage Strategy
**Decision:** Store the full `_bmpBuildPlanArtifact()` JSON in `brain_map_plans.full_artifact` JSONB column.

**Rationale:**
- Preserves all frontend state (timestamp, user inputs, demo_stamp, disclaimers) for audit
- Enables retrospective inspection without reconstructing from normalized columns
- Allows future schema changes without data loss

### 2. Readiness Score: Input Completeness, Not Efficacy
**Decision:** Readiness = `checklist_passed / checklist_total` (0–100%), based only on user inputs (patient? target? protocol? qEEG bridge?).

**Rationale:**
- No ML/efficacy scoring (no autonomous prescribing)
- Honest metric: "Are all required fields filled?" not "Will this work?"
- Clinician reviews the actual readiness_pct in the planning report panel

### 3. Protocol Suggestions: Query-Based, Not ML-Ranked
**Decision:** List protocols by target region + modality from DB. qEEG suggestions call `suggest_protocols_from_report()` (deterministic scoring based on z-scores, not LLM).

**Rationale:**
- Evidence-graded, deterministic
- Reuses existing qeeg_protocol_fit logic (already audit-tested)
- No black-box AI ranking

### 4. No FEM/Neuronavigation in Brain Map Planner
**Decision:** E-field visualization stays labeled "qualitative geometry only". No SimNIBS or FEM estimation.

**Rationale:**
- FEM requires validated head model (patient MRI + FreeSurfer segmentation) — out of scope for this phase
- Patient-specific neuronavigation = MRI Analyzer responsibility
- Brain Map Planner stays **atlas-first**, not imaging-first

### 5. Demo-Stamp for Unlinked Patients
**Decision:** If no `patient_id` linked, set `demo_stamp: true` and block "Send to session" / persistent save.

**Rationale:**
- Safety gate: prevents demo data entering real workflows
- Exports still download (for review/testing)
- Audit trail marks demo plans clearly

---

## API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/brain-map/plans` | POST | Clinician | Create plan |
| `/api/v1/brain-map/plans/{id}` | GET | Any | Retrieve plan (audit logged) |
| `/api/v1/brain-map/plans` | GET | Clinician | List patient's plans (filtered) |
| `/api/v1/brain-map/plans/{id}` | PATCH | Clinician/Creator | Update status |
| `/api/v1/brain-map/protocols` | GET | Any | Search protocol catalog (fallback if unavailable) |
| `/api/v1/qeeg/suggest-protocols` | POST | Clinician | qEEG analyzer bridge (existing, wired) |

---

## Testing Strategy

### Backend (pytest)
- **Unit:** Pydantic models (valid/invalid inputs)
- **Integration:** DB create/read/update, audit logging, role gates
- **E2E:** Full workflow (create plan → retrieve → list → archive)

### Frontend (Node/Jest)
- **Unit:** API wrapper functions (success, network error, timeout)
- **Component:** Save button flow, error toast on demo-stamp block
- **E2E:** Create plan via UI → verify in mock backend

### Audit & Safety
- ✓ No demo data persists (demo_stamp blocks DB save)
- ✓ No fabricated protocols or efficacy scores
- ✓ Role gates prevent non-clinicians from creating/approving plans
- ✓ Disclaimers rendered in JSON + PDF + on-page

---

## Files to Create / Modify

### Backend (Python)
- **Create:** `apps/api/app/routers/brainmap_router.py` (~400 lines)
- **Create:** `apps/api/app/schemas/brainmap.py` (Pydantic models, ~150 lines)
- **Create:** `apps/api/alembic/versions/2026_05_09_brainmap_tables.py` (~80 lines)
- **Modify:** `apps/api/app/main.py` (register brainmap_router)
- **Create:** `apps/api/tests/test_brainmap_router.py` (~300 lines, 8–10 test functions)

### Frontend (JavaScript)
- **Modify:** `apps/web/src/api.js` (add ~6 new methods, ~50 lines)
- **Modify:** `apps/web/src/pages-clinical-tools.js` (~100 lines for button/api-wiring)
- **Create:** `apps/web/src/brain-map-planner-api.test.js` (~150 lines, 5 test cases)

### Docs & Config
- **Create:** This architecture document (done)
- **Modify:** `docs/api-reference.md` (add endpoints)
- **Create:** `docs/brain-map-planner-contract.md` (BrainMapPlan JSON schema)

### Totals
- ~930 lines backend (Python)
- ~200 lines frontend (JS)
- ~6 test files (~650 lines)

---

## Dependencies & License Check

### New Libraries (if any)
None anticipated. Uses existing stack:
- FastAPI (already in `apps/api`)
- Pydantic (already in `apps/api`)
- SQLAlchemy + Alembic (already in `apps/api`)
- pytest (already in test suite)

### Approved OSS
- **plotly** (MIT) — used in chart overlays on research tab (already approved)

---

## Class C / Regulatory Blockers

### ✓ No Class C (Autonomous Prescribing, Fake Data, Paid APIs)
- No LLM-based protocol ranking (deterministic suggestion only)
- No fake citations or NCT numbers
- No copyrighted tools (no SimNIBS, no commercial FEM)
- No patient-specific neural imaging used in algorithm (atlas-first, not imaging-first)

### ✓ Clinical Safety Disclaimers
- "Decision-support only — clinician review required" (on page + in export)
- "Coordinate→electrode mapping uses 10-20 conventions; individual head models vary"
- "Protocol parameters require device-specific safety review"
- "Patient consent and screening required before stimulation"

---

## Success Criteria (Phase 1 Completeness)

- [x] Architecture document written (this file)
- [x] API endpoints scoped and documented
- [x] DB schema defined (Alembic migration template ready)
- [x] Pydantic model shapes outlined
- [x] Frontend-backend integration points identified
- [x] Testing strategy defined
- [x] No Class C blockers identified
- [x] No new dependencies needed (all existing)

---

## Open Questions for Phase 2–4 Handoff

1. **Protocol DB population:** Are `protocols` table rows already seeded from evidence DB? Or do we need a migration script?
2. **qEEG analyzer integration:** Is `POST /api/v1/qeeg/suggest-protocols` already wired, or does it need backend work?
3. **Audit log event format:** Should brain_map_plan_audit follow same schema as `audit_trail` table, or separate?
4. **Institutional workflows:** Are there downstream systems (compliance hub, EHR, Medidata?) that need webhooks on plan creation/approval?

---

## Appendix: Reference Links

- Previous stabilization: t_facf1511 (Brain Map Planner v2 Stabilization COMPLETE)
- Evidence DB: `~/DeepSynaps-Protocol-Studio/.../neuromodulation_evidence_2026-04-29_v4.db`
- qEEG protocol-fit service: `apps/api/app/services/qeeg_protocol_fit.py`
- Protocol Studio stabilization: t_3085bb01 (Protocol Studio Stabilize)
- Brain Map Planner contract: `docs/deepsynaps-qeeg-brain-map-contract.md`

---

**End of Phase 1 Architecture Document**

Generated: 2026-05-09 08:52 UTC  
Status: Ready for Phase 2 Implementation (brainmap_router.py + DB migration + frontend wiring)
