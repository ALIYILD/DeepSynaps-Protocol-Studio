# Night-Shift Task Board — 6 Specialist Work-Streams

**Generated:** 2026-04-26 23:00 UTC  
**Base branch:** `launch-readiness-audit`  
**Target:** Overnight specialist audits, fixes, and research passes — ready for morning review.

---

## STREAM 1: qEEG Analysis

**Owner:** qEEG engineer  
**Scope:** Ingestion, preprocessing, feature extraction, similarity scoring, reports, AI summaries

**In Scope (owned by this stream):**
- `packages/qeeg-pipeline/` (104 files) — all preprocessing, spectral analysis, connectivity, source loc, ML
- `packages/qeeg-encoder/` (29 files) — embeddings, conformal prediction, tabular representations
- `apps/api/app/routers/qeeg_*.py` (8 routers) — analyze, live, raw, viz, copilot, MNE pipeline, AI upgrades
- `apps/api/app/services/analyses/qeeg_*.py` — qEEG service logic
- `apps/web/src/pages-qeeg-*.js` (4 pages) — analysis, raw, viz, AI upgrades
- Test files: `apps/api/tests/test_qeeg*.py` (8 files)

**OFF-LIMITS (owned by other streams):**
- `packages/mri-pipeline/` — MRI stream
- `packages/feature-store/` — Feature store stream (feature definitions are OK, serving is NOT)
- `apps/api/app/routers/fusion_router.py` — Fusion stream (even though qEEG is input)
- `apps/web/src/pages-*mri*.js`, `pages-fusion*.js` — MRI/Fusion streams

**Acceptance Criteria:**
- All qEEG routes tested and passing
- qEEG pipeline can ingest EDF, output annotated signal + spectral analysis
- Similarity scoring includes confidence intervals
- Clinical summary uses Claude API with proper citations
- Report rendering includes method provenance

**Suggested Test Commands:**
```bash
pytest apps/api/tests/test_qeeg*.py -v
pytest packages/qeeg-pipeline/tests/ -v
npm run test:unit -- apps/web/src/pages-qeeg-analysis-page.test.js
```

---

## STREAM 2: MRI Analysis

**Owner:** MRI engineer  
**Scope:** NIfTI/DICOM ingestion, structural analysis, brain-age, DTI, incidental findings

**In Scope (owned by this stream):**
- `packages/mri-pipeline/` (31 files) — structural, fMRI, registration, models, worker
- `apps/api/app/routers/mri_analysis_router.py` — MRI endpoints
- `apps/api/app/services/analyses/mri_*.py` — MRI service logic
- `apps/web/src/pages-mri-analysis*.js` (4 pages + 3 test files) — analysis, brain-age, comparison, QC
- Test files: `apps/api/tests/test_mri_analysis_router.py` and web MRI tests

**OFF-LIMITS:**
- `packages/qeeg-pipeline/` — qEEG stream
- `packages/feature-store/` — Feature store stream
- `apps/api/app/routers/fusion_router.py` — Fusion stream
- `apps/web/src/pages-qeeg*.js` — qEEG stream

**Acceptance Criteria:**
- NIfTI validator accepts clinical scans, rejects malformed
- Brain-age model produces calibrated estimates with confidence
- Incidental-finding triage flags pathology with evidence references
- DTI/connectivity outputs ready for fusion
- Reports include modality QC flags and limitations

**Suggested Test Commands:**
```bash
pytest apps/api/tests/test_mri_analysis_router.py -v
pytest packages/mri-pipeline/tests/ -v
npm run test:unit -- 'apps/web/src/pages-mri-analysis*.test.js'
```

---

## STREAM 3: DigitalTwin (DeepTwin) Simulator

**Owner:** Digital Twin engineer  
**Scope:** Simulation engine, scenario management, predictions, uncertainty quantification, handoff

**In Scope (owned by this stream):**
- `apps/api/app/routers/deeptwin_router.py` — simulation endpoints
- `apps/api/app/services/deeptwin_*.py` — prediction logic, scenario state
- `apps/worker/app/` (jobs for simulation dispatch) — async runner
- `apps/web/src/pages-deeptwin.js` — UI, scenario builder, result viz
- Test files: `apps/api/tests/test_deeptwin_router.py`

**OFF-LIMITS:**
- qEEG/MRI analysis pipelines (inputs to simulation, not to modify)
- `packages/feature-store/` serving logic
- `apps/web/src/pages-brain-twin.js` — separate (if exists)

**Acceptance Criteria:**
- Simulation accepts qEEG/MRI + treatment scenario
- Outputs include prediction + uncertainty bands
- Scenario eviction (100-scenario limit) notifies user
- Simulation timeout (30s) handles long-running gracefully
- Handoff requires explicit user confirmation
- All 3 uncertainty methods (epistemic/aleatoric/calibration) documented

**Suggested Test Commands:**
```bash
pytest apps/api/tests/test_deeptwin_router.py -v
npm run test:unit -- apps/web/src/pages-deeptwin.js
```

---

## STREAM 4: Scoring (Risk/Evidence/Decision)

**Owner:** Scoring/risk engineer  
**Scope:** Risk stratification, evidence grading, decision-support scores, calibration

**In Scope (owned by this stream):**
- `packages/evidence/` (12 files) — evidence scoring, citation validation, audit
- `apps/api/app/routers/risk_stratification_router.py` — risk endpoints
- `apps/api/app/services/risk_*.py` — risk service logic
- Clinical pages consuming risk scores: `pages-courses.js`, `pages-clinical.js`, etc. (coordinate only, don't own entire page)
- Test files: `apps/api/tests/test_evidence_router.py`

**OFF-LIMITS:**
- qEEG/MRI analysis pipelines (they compute features; this stream consumes them)
- Fusion logic (`fusion_router.py`)
- Report generation (render-engine owns rendering)

**Acceptance Criteria:**
- Risk scores include confidence intervals + calibration cautions
- Evidence grading uses validated hierarchy (I, II-1, II-2, III, etc.)
- Decision-support outputs include attribution (which features drove the score?)
- Counter-evidence retrieval works for key claims
- Scores logged and auditable

**Suggested Test Commands:**
```bash
pytest apps/api/tests/test_evidence_router.py -v
pytest packages/evidence/tests/ -v
```

---

## STREAM 5: Evidence & Report Generation

**Owner:** Evidence/report engineer  
**Scope:** Report rendering, document export, citations, governance workflow

**In Scope (owned by this stream):**
- `packages/generation-engine/` (2 files) — protocol generation
- `packages/render-engine/` (2 files) — HTML/PDF rendering
- `apps/api/app/routers/documents_router.py`, `reports_router.py` — document endpoints
- `apps/api/app/services/report_*.py` — report service logic
- `apps/web/src/pages-protocols.js` — protocol builder UI, literature refresh recovery
- Test files: `apps/api/tests/test_documents_router.py`, `test_reports_router.py`

**OFF-LIMITS:**
- qEEG/MRI analysis (they generate payload, not rendering)
- Risk scoring (this stream consumes risk outputs in reports)
- Consent workflow (consent-router owns it)

**Acceptance Criteria:**
- Reports render with clinician + patient views
- Citations include DOI links + evidence levels
- Method provenance documented (which qEEG/MRI method was used?)
- Export formats (HTML, PDF) validated for all report types
- Protocol generation includes literature links

**Suggested Test Commands:**
```bash
pytest apps/api/tests/test_documents_router.py -v
pytest apps/api/tests/test_reports_router.py -v
npm run test:unit -- apps/web/src/pages-protocols.js
```

---

## STREAM 6: QA & Integration

**Owner:** QA engineer  
**Scope:** Cross-stream integration tests, smoke tests, governance checks, performance, deployment readiness

**In Scope (owned by this stream):**
- `packages/qa/` (8 files) — smoke tests, checks, specs
- Orchestration tests: patient workflow (onboard → qEEG → decision → report)
- Frontend E2E tests: `apps/web/playwright.config.ts` + `e2e/` scenarios
- Backend integration tests spanning multiple routers
- Deployment verification: startup checks, DB migrations, env validation

**OFF-LIMITS:**
- Individual module unit tests (owned by respective streams)
- Route implementation details (streams own those)

**Acceptance Criteria:**
- Smoke tests pass on all 5+ major workflows
- Cross-stream integration tests (qEEG → risk → report) passing
- Frontend E2E scenarios for clinic + patient portal complete
- Database migrations tested end-to-end
- Deployment readiness checklist all green

**Suggested Test Commands:**
```bash
pytest packages/qa/ -v
pytest apps/api/tests/ -v  # all integration tests
npm run test:e2e -- apps/web/playwright.config.ts
npm run build  # frontend build smoke test
```

---

## BLOCKING DEPENDENCIES & COORDINATION

**qEEG must complete before:**
- Risk/Scoring (risk scores consume qEEG features)
- DigitalTwin (simulator consumes qEEG payloads)
- Evidence/Reports (reports include qEEG summaries)

**MRI must complete before:**
- Fusion (needs MRI outputs)
- Risk/Scoring (some scores use MRI inputs)
- Evidence/Reports (reports may include MRI)

**Risk/Scoring must complete before:**
- Evidence/Reports (reports embed risk guidance)
- DigitalTwin (simulator may use risk as input)

**Evidence/Reports must complete before:**
- QA (integration tests validate full workflows)

**DigitalTwin must complete before:**
- QA (integration tests exercise simulator)

---

## DAILY HANDOFF PROTOCOL

Each stream runs nightly:
1. Run your test suite
2. Document blockers/findings in a small markdown file
3. Push a feature branch (do NOT merge to main)
4. Leave findings + branch name in morning report

Example: `docs/overnight/2026-04-26-night/stream-qeeg-findings.md`

At morning standup, PM/architect will:
- Review all 6 findings
- Merge non-conflicting branches
- Triage any blockers for next shift

