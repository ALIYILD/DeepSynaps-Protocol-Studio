# Launch Readiness Report

Branch: `launch-readiness-audit`
Date: `2026-04-25`
Product: `DeepSynaps Studio`

## Scope

Repo-wide launch-readiness audit for neuromodulation clinic and patient use, with emphasis on:
- clinic and patient workflows
- protocol/evidence governance
- AI/DeepTwin safety boundaries
- auth, consent, auditability, and deployment readiness

## Running TODO

- [x] Create audit branch
- [x] Map repo architecture
- [x] Run backend baseline tests
- [x] Run frontend baseline build
- [x] Run frontend baseline unit tests
- [ ] Review clinic portal flows
- [ ] Review patient portal/dashboard flows
- [ ] Review protocol/evidence/governance flows
- [ ] Review DeepTwin safety and simulation flows
- [ ] Review deployment and env configuration
- [x] Fix initial launch blockers
- [ ] Re-run broader verification
- [ ] Final launch score and recommendations

## Architecture Map

### Apps

- `apps/api`: FastAPI backend with a large clinical/patient/admin API surface
- `apps/web`: Vite web app with clinician, patient, protocol, analytics, qEEG, MRI, and DeepTwin pages
- `apps/worker`: background worker scaffold, including DeepTwin simulation helper

### Shared packages

- `packages/core-schema`: shared Pydantic/domain models
- `packages/deepsynaps-core`: timeline, risk, agent bus primitives
- `packages/feature-store`: multimodal feature transforms and serving
- `packages/evidence`: evidence scoring, schema, validation, audit helpers
- `packages/generation-engine`: deterministic protocol/document generation
- `packages/safety-engine`: compatibility and safety checks
- `packages/render-engine`: report rendering
- `packages/device-registry`, `packages/condition-registry`, `packages/modality-registry`: structured registries
- `packages/qeeg-pipeline`, `packages/qeeg-encoder`, `packages/mri-pipeline`: analysis pipeline packages
- `packages/qa`: QA helpers

### Frontend modules

- App shell and routing: `apps/web/src/app.js`
- Clinic/clinical surfaces:
  - `pages-clinical.js`
  - `pages-clinical-hubs.js`
  - `pages-clinical-tools.js`
  - `pages-practice.js`
  - `pages-courses.js`
  - `pages-protocols.js`
  - `pages-handbooks.js`
  - `pages-monitor.js`
  - `pages-monitoring.js`
  - `pages-consent.js`
- Patient surfaces:
  - `pages-patient.js`
  - `pages-patient-timeline.js`
- Analytics/AI:
  - `pages-qeeg-analysis.js`
  - `pages-qeeg-raw.js`
  - `pages-qeeg-viz.js`
  - `pages-mri-analysis.js`
  - `pages-deeptwin.js`
  - `pages-brain-twin.js`
  - `pages-agents.js`

### Backend routes

Registered centrally in `apps/api/app/main.py`, including:
- auth, payments, finance, profile, team, preferences
- patients, sessions, assessments, outcomes
- treatment courses and review queue
- consent records and consent management
- patient portal, notifications, reminders, wearables, device sync
- home program tasks and templates
- documents, reports, recordings, exports
- protocol generation and saved protocols
- evidence, library, literature, citation validation
- qEEG analysis/live/raw/viz/copilot
- MRI analysis and fusion
- command center, monitoring, DeepTwin/Brain Twin
- admin/pgvector and feature-store

### Database/persistence

Main SQLAlchemy model file: `apps/api/app/persistence/models.py`

Observed major entities:
- users, subscriptions, team members, password reset tokens
- patients, clinical sessions, clinical session events
- assessments
- prescribed protocols, treatment courses, treatment course reviews, protocol versions
- delivered session parameters, adverse events, consent records, phenotype assignments
- documents/reports/media
- patient portal messages and home-program completion state
- qEEG, MRI, feature store, DeepTwin, evidence, and audit-related tables

### Auth and roles

Server-side auth entrypoint: `apps/api/app/auth.py`

Observed roles:
- `guest`
- `patient`
- `technician`
- `reviewer`
- `clinician`
- `admin`

Role enforcement is primarily server-side through `require_minimum_role(...)`.
Demo tokens are honored only in `development` and `test`; this audit adds an explicit production/staging block for demo JWT issuance.

## Baseline Commands

Executed:

```powershell
git checkout -b launch-readiness-audit
npm.cmd run build:web
npm.cmd run test:unit --workspace @deepsynaps/web
.\.venv\Scripts\python.exe -m ensurepip --upgrade
.\.venv\Scripts\python.exe -m pip install pytest pytest-xdist httpx -e packages/core-schema -e packages/condition-registry -e packages/modality-registry -e packages/device-registry -e packages/qa -e packages/safety-engine -e packages/generation-engine -e packages/render-engine -e apps/api
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_health.py apps/api/tests/test_patient_portal.py apps/api/tests/test_home_program_tasks.py apps/api/tests/test_evidence_router.py -q
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_auth_persistence.py apps/api/tests/test_deeptwin_router.py -q
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_security.py apps/api/tests/test_production_hardening.py apps/api/tests/test_2fa_flow.py apps/api/tests/test_course_safety_gate.py apps/api/tests/test_consent_records.py -q
```

## Current Findings

### Confirmed passes

- Frontend production build passes when run outside the sandbox.
- Frontend unit test suite passes: `94 passed`.
- Backend smoke/governance/security slices pass:
  - `48 passed` in health + patient portal + home-program + evidence smoke
  - `16 passed` in auth + DeepTwin regression coverage
  - `64 passed` in security + production-hardening + 2FA + course-safety + consent slices

### Confirmed blockers fixed

1. Production demo-login was enabled.
   Fix:
   - `/api/v1/auth/demo-login` now returns `403 demo_login_disabled` in `production` and `staging`.
   - frontend demo tab and demo-login UX now render only in dev or when `VITE_ENABLE_DEMO=1`.

2. DeepTwin patient-specific endpoints lacked clinician gating.
   Fix:
   - DeepTwin analyze, simulate, evidence, and patient-scoped summary/timeline/signal/correlation/prediction/report/handoff endpoints now require clinician-or-admin access.

3. Clinician hub contained fake report cards with active click handlers.
   Fix:
   - replaced clickable `coming soon` alert cards with disabled roadmap items and explanatory copy.

### Residual risks

- The full backend suite still has not been completed end-to-end within this audit window; a broad run exceeded the current timeout and needs a longer unattended pass.
- The repo is very large, and many frontend pages still need explicit manual/functional review for empty/error/loading states and true backend wiring.
- README readiness claims remain broader than the verification evidence gathered in this pass.
