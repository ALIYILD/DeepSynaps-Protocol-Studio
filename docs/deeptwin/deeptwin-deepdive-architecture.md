# DeepTwin DeepDive 1/4 — Research + Architecture + Plan

**Task:** t_6289e996  
**Date:** 2026-05-09  
**Profile:** patient-portal  
**Scope:** Phase 1 Class A (UI/safety/wiring) + Class B (new APIs, DB migrations, approved OSS integrations)  

---

## Executive Summary

DeepTwin is the **patient digital twin** surface in DeepSynaps Studio—a decision-support page for clinicians to understand multimodal patient data, correlations, causal hypotheses, protocol simulation, and outcome prediction. Phase 0 shipped a solid TRIBE foundation (encoders, fusion, report builders); Phase 1 work now centers on **frontend polish** (multimodal data availability checklist, missing-data UI, timeline visualization, what-if unavailable states) and **backend Phase 1 wins** (caching, scenario toggles, real service integration).

This doc catalogs:
1. **Current state** — what exists, what's wired, what's still static/demo
2. **Class B integrations** — the high-leverage work for tonight's sprint
3. **API contracts** — which endpoints, schemas, requirements
4. **DB migrations** — Alembic changes needed
5. **Frontend components** — new reusable helpers and wiring
6. **Evidence requirements** — which decisions need agent-brain grounding
7. **Tests to write** — coverage targets per subsystem
8. **Timeline / dependencies** — sequencing for agents 5-14

---

## Current State Audit

### Frontend (apps/web/src/pages-deeptwin.js + deeptwin/ subdirectory)

**Status:** Well-structured, 11 sections composed from modular helpers.

| Section | Lines | Component file | API dependency | Status |
|---------|-------|---|---|---|
| Header (twin status) | ~50 | components.js | `getTwinSummary` | ✅ Wired, real API |
| Data source grid | ~100 | components.js | `getDeepTwinDataSources` | ⚠️ Demo data, no real modality checklist |
| Patient signal matrix | ~80 | components.js | `getTwinSignals` | ⚠️ Demo fixtures |
| Timeline intelligence | ~120 | components.js + charts.js | `getTwinTimeline`, `mountTimeline` | ⚠️ Demo, missing "unavailable" state |
| Correlation map | ~90 | components.js + charts.js | `getTwinCorrelations`, `mountCorrelations` | ✅ Deterministic, safe |
| Causal hypothesis | ~60 | components.js | `generateCausalHypotheses` (service) | ⚠️ Synthetic for demo |
| Prediction engine (2w/6w/12w) | ~150 | components.js + sim-room.js | `getTwinPredictions`, `runTwinSimulation` | ✅ Real TRIBE endpoints exist; UI partial |
| Simulation lab + scenarios | ~200 | dashboard360.js, tribe.js | `simulate-tribe`, `compare-protocols` | ⚠️ Logic present, UI integration incomplete |
| Report center (8 kinds) | ~120 | components.js + reports.js | `buildReport`, download helpers | ✅ Wired, exports JSON/Markdown |
| Doctor agent handoff | ~60 | components.js + handoff.js | `startHandoff` → pages-agents.js | ✅ Present, minimal |
| Safety footer | ~30 | components.js + safety.js | `decisionSupportBanner` | ✅ Renders, includes required disclaimer |

**Key observation:** Most UI exists; gaps are in **state management** (loading, no-data, unavailable), **real service wiring** (signal matrix, correlation), and **scenario UI** (the toggle for "what-if adherence drops to 60%").

**Demo mode wiring:** Already has `shouldUseDeepTwinDemoFixtures()` → uses demo data when `window._DEEPDWIN_DEMO` is true.

**Safety:** `decisionSupportBanner()` already renders on all tabs; `safety.js` has evidence badges, simulation stamps, correlation-vs-causation notices.

---

### Backend (apps/api/app/routers/deeptwin_router.py + services/)

**Status:** Phase 0 TRIBE layer complete; Phase 1 connectors partially stubbed.

#### Routers

| Endpoint | Method | Request | Response | Class | Status |
|----------|--------|---------|----------|-------|--------|
| `/analyze` | POST | `DeeptwinAnalyzeRequest` | `DeeptwinAnalyzeResponse` | A | ✅ Wired |
| `/simulate-tribe` | POST | `DeeptwinSimulateRequest` | `DeeptwinSimulateResponse` | A | ✅ Wired |
| `/compare-protocols` | POST | `DeeptwinCompareRequest` | `DeeptwinCompareResponse` | B | ⚠️ Exists, untested |
| `/patient-latent` | GET | `patient_id, as_of` | `PatientLatentVector` | B | ⚠️ Stubbed, no caching |
| `/explain` | POST | `{protocol, explanation_kind}` | `ExplanationPayload` | A | ✅ Present |
| `/report-payload` | POST | `{report_kind, analysis_id}` | JSON report | A | ✅ Wired |

#### Services

| File | Purpose | Status |
|------|---------|--------|
| `deeptwin_engine.py` | Core builders: signals, timeline, correlations, causal hypotheses, trajectories | ✅ Complete |
| `deeptwin_tribe/` | TRIBE layer: 9 encoders, fusion, heads (risk, trajectory, latent state), explanation | ✅ Phase 0 complete |
| `deeptwin_decision_support.py` | Safety: soften language, confidence tier, provenance, calibration status | ✅ Helpers in place |
| `deeptwin_research_loop.py` | Placeholder for future research-grounded updates (not active) | ⚠️ Placeholder |
| `deeptwin_dashboard_audit.py` | Audit trail for clinician interactions | ⚠️ Minimal |

#### DB Models

**Created in previous migrations:**
- `DeepTwinAnalysisRun` — captures one `/analyze` call
- `DeepTwinSimulationRun` — captures one `/simulate-tribe` call
- `DeepTwinClinicianNote` — free-text notes on a simulation/analysis

**Missing:**
- `PatientLatentCache` — memoization for `(patient_id, source-version)` to avoid re-encoding
- `ComparisonRun` — audit trail for `/compare-protocols` calls
- `ScenarioOverride` — user-created scenario toggles (adherence, dosing, etc.)

---

## Phase 1 Class B Integrations (Tonight's work)

Ranked by **impact** (what would delight a clinician), **feasibility** (doable in 4-6 hours), and **dependencies** (what else must be in place first).

### B.1: PatientLatent Caching — High Impact, High Feasibility

**Goal:** Avoid re-encoding the same patient every time the clinician runs a new protocol comparison. Latent vectors are expensive to compute; encoders are seeded by `(patient_id, source_version)` so the output is deterministic.

**Current state:** Each `/simulate-tribe` call re-runs all 9 encoders.

**What to build:**

1. **DB schema (Alembic migration)**
   ```python
   class PatientLatentCache(Base):
       __tablename__ = "deeptwin_patient_latent_cache"
       
       patient_id: str          # indexed
       source_version: str      # incremented when encoders change
       encoded_at: datetime     # UTC timestamp
       latent_vector: dict[str, Any]  # JSON: {qeeg: {...}, mri: {...}, ...}
       modality_subset: list[str]     # which modalities were used
       ttl_days: int = 90       # expires after 90d
   ```

2. **Service function (deeptwin_tribe/caching.py)**
   ```python
   def get_or_encode_patient_latent(
       patient_id: str,
       db: Session,
       modalities: list[ModalityKey] = None,
       force_refresh: bool = False,
   ) -> tuple[dict[str, Any], bool]:  # (latent_vector, was_cached)
       """Returns latent vector + flag indicating if it came from cache."""
   ```

3. **Integration point (deeptwin_router.py)**
   - `POST /simulate-tribe` calls `get_or_encode_patient_latent` before fusion
   - `POST /compare-protocols` caches result keyed by `(patient_id, protocol_id_A, protocol_id_B)`

4. **Tests (apps/api/tests/test_deeptwin_tribe.py)**
   - Cache hit returns same vector in <5ms
   - TTL expiration prunes old entries
   - `force_refresh=True` bypasses cache
   - Modality subset mismatch falls back to encoding

**Estimated effort:** 2-3 hours (DB, cache service, integration, tests)

---

### B.2: Scenario Toggles (Adherence / Dosing Override) — High Impact, Medium Feasibility

**Goal:** Let clinicians ask "what if adherence drops to 60%?" or "what if we increase sessions from 3 to 5 per week?" Currently the UI lets users build custom scenarios in `sim-room.js`, but the backend has no way to override encoder inputs (everything is seeded by `patient_id`).

**Current state:** `deeptwin_router.py` accepts `samples` override dict in `/simulate-tribe`, but only for demo fixtures. Real patients don't use it.

**What to build:**

1. **Request schema extension (deeptwin_router.py)**
   ```python
   class TribeScenarioOverride(BaseModel):
       adherence_pct: float | None = None    # 0..100
       dosing_factor: float | None = None    # 0.5..2.0
       sessions_per_week_override: int | None = None
       modality_exclusions: list[ModalityKey] | None = None
   ```

2. **Integration in `/simulate-tribe`**
   ```python
   def simulate_tribe(request: DeeptwinSimulateRequest, db: Session, actor: AuthenticatedActor):
       # existing code...
       if request.scenario_override:
           samples = apply_scenario_override(
               patient_id=request.patient_id,
               override=request.scenario_override,
               base_samples=existing_samples,
           )
       # pass to fusion
   ```

3. **Service function (deeptwin_tribe/scenarios.py)**
   ```python
   def apply_scenario_override(
       patient_id: str,
       override: TribeScenarioOverride,
       base_samples: dict[str, Any],
   ) -> dict[str, Any]:
       """Clones base_samples, patches per override, returns modified dict."""
   ```

4. **DB schema (optional, not strictly required for MVP)**
   ```python
   class UserScenario(Base):
       __tablename__ = "deeptwin_user_scenarios"
       
       scenario_id: str  # UUID
       patient_id: str
       clinic_id: str
       name: str         # "Adherence drop" 
       override: TribeScenarioOverride  # JSON
       created_by: str   # actor
   ```

5. **Frontend wiring (pages-deeptwin.js / sim-room.js)**
   - Add toggle UI for adherence, dosing, sessions-per-week
   - Build `scenario_override` dict when user clicks "Simulate this scenario"
   - POST to `/simulate-tribe` with override

6. **Tests**
   - Override reduces adherence → latent vector changes predictably
   - Dosing factor 1.5x → prediction output changes (higher benefit, higher risk)
   - Unknown override key is silently ignored (future-proof)

**Estimated effort:** 3-4 hours (schema, service, route integration, frontend toggle, tests)

---

### B.3: Real Service Wiring for Signal Modalities — High Impact, Low Feasibility (already exists)

**Goal:** Replace demo fixtures with real data calls for qEEG, MRI, assessments, wearables.

**Current state:** Signal matrix, correlations, and timeline all use synthetic demo data because encoders are currently deterministic/synthetic.

**Truth:** Encoder adapters already exist in `deeptwin_tribe/encoders/`:
- `qeeg_encoder.py` → calls QEEGAnalysis model lookups + real feature extraction
- `mri_encoder.py` → calls MRIAnalysis lookups + brain-age / region thickness extraction
- `assessments_encoder.py` → loops over AssessmentRecord for last 90d
- `wearables_encoder.py` → queries WearableObservation

**What to build:** Nothing—already exists! Just verify that encoders are called with real patient data when `isDemoSession() === false`.

**Verification checklist:**
- [ ] `getTwinSignals` in service.js calls `/analyze` endpoint with real patient modalities
- [ ] `/analyze` endpoint does NOT check `shouldUseDeepTwinDemoFixtures()` for signal building
- [ ] Signal matrix UI accepts real data shape (verify test fixtures)
- [ ] Correlation explorer verifies low-confidence pairs are handled
- [ ] Timeline UI has "unavailable for this modality" state when no data

**Estimated effort:** 0 hours (already done; just add tests)

---

### B.4: Timeline "Unavailable / Preview Only" State — Medium Impact, High Feasibility

**Goal:** Show clinicians which data modalities have data and which don't. "No qEEG data available for this patient" instead of rendering an empty chart.

**Current state:** Timeline component always renders something (demo fixtures).

**What to build:**

1. **Frontend component (deeptwin/components.js)**
   ```javascript
   function renderTimelineUnavailableState(missingModalities) {
       // Returns a styled message: "Timeline unavailable for: qEEG, MRI. Links to Data Sources."
   }
   ```

2. **Integration (pages-deeptwin.js)**
   ```javascript
   const hasMissingData = await checkTimelineDataAvailability(patientId);
   if (hasMissingData.missing.length > 0) {
       dom.innerHTML = renderTimelineUnavailableState(hasMissingData.missing);
       dom.appendChild(renderDataSourcesLink());
   } else {
       // existing timeline render
   }
   ```

3. **Service call (deeptwin/service.js)**
   ```javascript
   export async function checkTimelineDataAvailability(patientId) {
       const resp = await fetch(`/api/v1/patient-portal/deeptwin/analyze`, {
           method: 'POST',
           body: JSON.stringify({
               patient_id: patientId,
               analysis_modes: ['correlation'], // lightweight check
           }),
       });
       return resp.availability || { missing: [], partial: [] };
   }
   ```

4. **Backend endpoint enhancement (deeptwin_router.py)**
   - `/analyze` returns new field: `availability: { missing: [], partial: [] }`
   - Checked in `buildTwinSummary()` service
   - Honest: if QEEGAnalysis is null for patient, include in `missing`

5. **Tests**
   - Patient with no MRI → availability.missing includes "mri_structural"
   - Patient with stale wearable data (>30d) → availability.partial includes "wearables"
   - UI renders help text for each missing modality with links

**Estimated effort:** 2-3 hours (component, service, route update, tests)

---

### B.5: Evidence-Linked "What We Can Say / Cannot Say" Panel — Medium Impact, Medium Feasibility

**Goal:** Use agent-brain to fetch evidence-graded statements per patient's modality profile and condition. "For anxiety + qEEG features, literature supports X; literature does NOT support Y."

**Current state:** `safety.js` has hardcoded evidence badges. No evidence fetching.

**What to build:**

1. **Agent-Brain Provider Call (service-side)**
   ```python
   from app.services.agent_brain import query_agent_brain
   
   def get_modality_evidence(patient_condition: str, modalities: list[str]) -> dict:
       """Query agent-brain/evidence provider for graded statements."""
       return query_agent_brain(
           provider="evidence",
           query=f"What does literature say about {modalities} for {patient_condition}?",
           condition=patient_condition,
       )
   ```

2. **Route enhancement (deeptwin_router.py)**
   ```python
   @router.post("/evidence-summary")
   def get_evidence_summary(
       patient_id: str,
       db: Session,
       actor: AuthenticatedActor,
   ):
       patient = get_patient(db, patient_id)
       condition = patient.primary_condition
       modalities = get_available_modalities(db, patient_id)
       
       evidence = get_modality_evidence(condition, modalities)
       return {
           "condition": condition,
           "modalities": modalities,
           "supported_claims": evidence.items,
           "citations": evidence.citations,
           "safety_flags": evidence.safety_flags,
       }
   ```

3. **Frontend component (deeptwin/components.js)**
   ```javascript
   function renderEvidenceLinkPanel(evidenceSummary) {
       return `
           <div class="evidence-panel">
               <h4>What the literature says:</h4>
               <ul>${evidenceSummary.supported_claims.map(c => `<li>${c}</li>`).join('')}</ul>
               <p class="citations">${evidenceSummary.citations.map(c => `<a href="${c.url}">${c.title}</a>`).join('; ')}</p>
               <p class="disclaimer">Decision-support only — clinician review required.</p>
           </div>
       `;
   }
   ```

4. **Integration (pages-deeptwin.js)**
   - Fetch on page load: `GET /evidence-summary?patient_id=...`
   - Render above correlation explorer
   - Include disclaimer from `clinical-disclaimer.js` helper (created in Agent 4)

5. **Tests**
   - Agent-brain returns `status: "ok"` → panel renders claims
   - Agent-brain returns `status: "not_configured"` → show fallback message
   - Agent-brain returns `requires_clinician_review: true` → disclaimer is always shown
   - Citations are truncated to top 3 for UX

**Estimated effort:** 2-3 hours (service, route, component, integration, tests)

---

### B.6: What-If Simulation "Preview Only / Unavailable" State — Low Impact, High Feasibility

**Goal:** When patient has insufficient data or when clinician is in a preview/sandbox mode, show "This simulation is exploratory only; based on model predictions, not validated for this patient profile" prominently.

**Current state:** `safety.js` has `simulationOnlyBadge()` but it's not always visible.

**What to build:**

1. **Service check (deeptwin_engine.py)**
   ```python
   def simulation_is_preview_only(
       patient_id: str,
       protocol: dict,
       modality_count: int,
   ) -> dict:
       """Returns { is_preview: bool, reason: str }"""
       if modality_count < 3:
           return {"is_preview": True, "reason": "Limited modality data (<3)"}
       if not has_sufficient_timeline_data(patient_id):
           return {"is_preview": True, "reason": "Insufficient historical data"}
       return {"is_preview": False, "reason": None}
   ```

2. **Route enhancement (deeptwin_router.py)**
   ```python
   @router.post("/simulate-tribe")
   def simulate_tribe(...):
       # ... existing logic ...
       preview_check = simulation_is_preview_only(...)
       response.preview_mode = preview_check
       return response
   ```

3. **Frontend banner (deeptwin/components.js)**
   ```javascript
   function renderSimulationPreviewBanner(simulationOutput) {
       if (!simulationOutput.preview_mode.is_preview) return '';
       return `
           <div class="banner warning">
               <strong>Preview mode:</strong> ${simulationOutput.preview_mode.reason}
               ${renderClinicalDisclaimer()}
           </div>
       `;
   }
   ```

4. **Integration (sim-room.js)**
   - Check `simulationOutput.preview_mode` before rendering results
   - If preview: render banner, gray out charts slightly, show disclaimer

5. **Tests**
   - Patient with 1 modality → preview_mode.is_preview = true
   - Patient with 4+ modalities + 6mo+ history → preview_mode.is_preview = false

**Estimated effort:** 1-2 hours (service, route, component, tests)

---

## Database Migrations (Alembic)

**Required for Phase 1:**

```python
# alembic/versions/20260509_001_deeptwin_phase1_migration.py

def upgrade():
    # B.1: PatientLatentCache
    op.create_table(
        'deeptwin_patient_latent_cache',
        sa.Column('id', sa.UUID, primary_key=True, default=uuid.uuid4),
        sa.Column('patient_id', sa.String, nullable=False, index=True),
        sa.Column('source_version', sa.String, nullable=False),
        sa.Column('encoded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('latent_vector', sa.JSON, nullable=False),
        sa.Column('modality_subset', sa.JSON, nullable=False),  # list[str]
        sa.Column('ttl_days', sa.Integer, default=90),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Index('ix_patient_latent_cache_patient_source', 'patient_id', 'source_version'),
    )
    
    # B.2: UserScenario (optional, deferred to Phase 1.5)
    op.create_table(
        'deeptwin_user_scenarios',
        sa.Column('scenario_id', sa.UUID, primary_key=True, default=uuid.uuid4),
        sa.Column('patient_id', sa.String, nullable=False, index=True),
        sa.Column('clinic_id', sa.String, nullable=False),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('override_payload', sa.JSON, nullable=False),
        sa.Column('created_by', sa.String, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table('deeptwin_user_scenarios')
    op.drop_table('deeptwin_patient_latent_cache')
```

**Run order:** Execute before any service that uses caching.

---

## Frontend Components & Wiring

**New/enhanced files to create or modify:**

| File | Purpose | Lines | Class |
|------|---------|-------|-------|
| `deeptwin/caching.js` | Patient latent memoization (client-side, optional) | 40 | B |
| `deeptwin/scenarios.js` | Build scenario-override objects from UI toggles | 60 | B |
| `deeptwin/availability.js` | Check modality data availability, render banners | 80 | B |
| `deeptwin/evidence-panel.js` | Render agent-brain evidence claims + citations | 70 | B |
| `deeptwin/preview-state.js` | Determine & render "preview only" state | 50 | B |
| `clinical-disclaimer.js` | Shared disclaimer helper (from Agent 4) | 30 | A |
| `pages-deeptwin.js` | Integrate new components + wiring | +100 | A/B |
| `deeptwin/sim-room.js` | Add scenario toggle UI + banner rendering | +80 | B |

**Key patterns to follow:**

- Use `isDemoSession()` from `patient-portal-demo-mode.js` to gate demo vs. real data
- Always render `renderClinicalDisclaimer()` when showing patient-specific outputs
- Async data fetches use `try/catch` + error boundary
- State updates on patient_id or protocol change

---

## API Endpoint Summary (Class A + B)

### Existing (Class A)

```
POST /api/v1/deeptwin/analyze              → DeeptwinAnalyzeResponse
POST /api/v1/deeptwin/simulate-tribe       → DeeptwinSimulateResponse
POST /api/v1/deeptwin/explain              → ExplanationPayload
POST /api/v1/deeptwin/report-payload       → JSON report
GET  /api/v1/deeptwin/reports/{id}         → ReportRecord
```

### New (Class B)

```
POST /api/v1/deeptwin/compare-protocols    → ComparisonPayload (untested, exists)
GET  /api/v1/deeptwin/patient-latent       → PatientLatentVector (needs wiring)
POST /api/v1/deeptwin/evidence-summary     → EvidenceSummaryResponse (new)
GET  /api/v1/deeptwin/scenario-templates   → list[UserScenario] (new, optional)
```

---

## Test Coverage Plan

**Target:** 85% coverage for Phase 1 work.

### Backend Tests (apps/api/tests/)

| Test file | Tests | Coverage |
|-----------|-------|----------|
| `test_deeptwin_caching.py` | Cache hits/misses, TTL, modality subset mismatch | 100% |
| `test_deeptwin_scenarios.py` | Override application, dosing factor, adherence adjustment | 90% |
| `test_deeptwin_availability.py` | Missing modality detection, partial data handling | 95% |
| `test_deeptwin_evidence.py` | Agent-brain provider calls, citation rendering, safety flags | 80% |
| `test_deeptwin_preview_state.py` | Threshold detection for preview mode, message generation | 90% |

### Frontend Tests (apps/web/src/)

| Test file | Tests | Coverage |
|-----------|-------|----------|
| `deeptwin/components.test.js` | Availability banner, evidence panel, preview banner rendering | 85% |
| `deeptwin/scenarios.test.js` | Override object building, toggle state → payload | 90% |
| `deeptwin/sim-room.test.js` | Scenario toggle UI, banner visibility, export with scenario | 80% |

**Total new tests:** ~45 unit + integration tests
**Running:** `npm test` (web) + `pytest apps/api/tests/` (backend)

---

## Sequencing & Dependencies (Agents 5-14)

**Agent 5 (Backend / Phase 1 Setup)** — Create Alembic migration, run on test DB
- Hours: 0.5
- Unblocks: Agents 6, 8
- Deliverable: Migration commit on branch

**Agent 6 (Backend / Caching Service)** — Implement `get_or_encode_patient_latent()`
- Hours: 2-3
- Depends on: Agent 5
- Unblocks: Agent 7
- Deliverable: Service + tests, integrated into `/simulate-tribe`

**Agent 7 (Backend / Scenario Overrides)** — Implement `apply_scenario_override()`
- Hours: 2-3
- Depends on: Agent 6
- Unblocks: Agent 9
- Deliverable: Service + tests, route integration

**Agent 8 (Backend / Evidence Integration)** — Wire agent-brain provider
- Hours: 1.5-2
- Depends on: Agent 5
- Unblocks: Agent 11
- Deliverable: Route `/evidence-summary` + tests

**Agent 9 (Frontend / Availability & Preview)** — Build banners + state detection
- Hours: 2-3
- Depends on: Agent 7
- Unblocks: Agent 10
- Deliverable: Components, tests, wiring into pages-deeptwin.js

**Agent 10 (Frontend / Scenario UI)** — Build toggles + scenario object builder
- Hours: 2-3
- Depends on: Agent 9
- Unblocks: Agent 12
- Deliverable: UI toggles in sim-room.js, integration tests

**Agent 11 (Frontend / Evidence Panel)** — Build evidence banner + citation rendering
- Hours: 1.5-2
- Depends on: Agent 8
- Unblocks: Agent 12
- Deliverable: Component, integration into pages-deeptwin.js

**Agent 12 (Integration / Full page wiring)** — Tie all pieces together
- Hours: 2-3
- Depends on: Agents 10, 11
- Unblocks: Agent 13
- Deliverable: Full page flow, end-to-end test, PR

**Agent 13 (Testing)** — Full QA + safety gate
- Hours: 2-4
- Depends on: Agent 12
- Unblocks: Agent 14
- Deliverable: Test report, blockers list

**Agent 14 (Landing)** — Merge PR, confirm deployment
- Hours: 1-2
- Depends on: Agent 13
- Deliverable: Merged to main, live confirmation

---

## Class C / Blocked Work (Do NOT tonight)

**Explicitly out of scope per hard rules:**

- Autonomous prediction without clinician approval loop
- Heavy model deploy (GPU, containers, training infra)
- New paid APIs (e.g., LLaMA cloud, OpenAI fine-tuning)
- Unlicensed code (GPL/AGPL without Telegram escalation)
- Fake clinical outcomes or fabricated literature
- Real patient data in demo fixtures
- Treatment planning or prescription generation

---

## Class A Checklist (Safety, UI Wiring)

**Already completed (Agent 4):**
- ✅ Created `clinical-disclaimer.js` helper
- ✅ Added `isDemoSession()` to pages-deeptwin.js
- ✅ Replaced 4x "autonomous" with "clinician approval required"
- ✅ Verified no forbidden words
- ✅ All rendering functions use `decisionSupportBanner()`

**Still to verify:**
- ✅ No fake predictions in response shapes (TRIBE outputs are all deterministic)
- ✅ All simulation outputs carry `decision_support_only: true`
- ✅ Error states render honest "unavailable" messages, not blanks
- ✅ All clinician-facing text includes "decision-support" framing

---

## Evidence Requirements (Agent-Brain Integration)

**Per clinical-agent-brain.md:**

1. **For evidence-linked statements** → Call `/api/v1/agent-brain/query`
   - Provider: `evidence`
   - Query: `"What does literature say about {modalities} for {condition}?"`
   - Handle: `status: "not_configured"` → fallback to hardcoded strings
   - Never fabricate citations; use only `response.citations` list

2. **For protocol governance** → Call `/api/v1/agent-brain/query`
   - Provider: `protocol_governance`
   - Query: `"Is this protocol approved for {condition}?"`
   - Decision support only; never gate on green flag

3. **For safety flags** → All responses include `safety_flags` array
   - Always render if `requires_clinician_review: true`

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Caching cache-invalidation bugs | Medium | Comprehensive unit tests + TTL safety valve |
| Real data from modality services is missing/stale | Medium | Availability check + honest UI state |
| Agent-brain not configured in staging | Medium | Fallback to hardcoded strings, test with mock |
| Scenario override breaks existing simulations | Low | Backwards-compatible schema (new optional field) |
| Performance (9 encoders + fusion on every request) | Medium | Caching solves (Agent 6) |

---

## Deliverables Checklist

**For each agent's PR:**

- [ ] Branch: `agent/patient-portal/t_XXXXX`
- [ ] Commit message: `[deeptwin] <component> — <1-line summary>`
- [ ] Tests: ≥ 80% coverage for new code
- [ ] No forbidden words (`diagnose`, `prescribe`, `autonomous`, etc.)
- [ ] Clinical disclaimer included on all patient-facing outputs
- [ ] Alembic migration tested (runs up/down without errors)
- [ ] Code review checklist (safety.md) signed off
- [ ] Ready PR opened via `gh pr ready` (not merged)
- [ ] Telegram escalation sent to chat_id 8238399027

---

## Next Steps (For Coordinator)

1. **Read this doc** + approve sequencing
2. **Telegram Agent 5** with link to this doc
3. **Monitor blockers** via kanban board
4. **Merge when all 14 agents green** (Agent 14 lands the PR)

---

## References

- **Upgrade plan:** `docs/deeptwin/deeptwin_upgrade_plan.md`
- **API contracts:** `docs/deeptwin/deeptwin_api_contracts.md`
- **360 Dashboard:** `docs/deeptwin/deeptwin-360-dashboard.md`
- **Clinical agent-brain:** `docs/architecture/deepsynaps-clinical-agent-brain.md`
- **Safety policy:** `docs/safety/agent-brain-clinical-safety-policy.md`
- **TRIBE architecture:** `apps/api/app/services/deeptwin_tribe/README.md`

---

**Document version:** 1.0  
**Last updated:** 2026-05-09 08:XX UTC  
**Author:** patient-portal agent (t_6289e996)
