<!-- /autoplan restore point: /c/Users/yildi/.gstack/projects/ALIYILD-DeepSynaps-Protocol-Studio/launch-readiness-audit-autoplan-restore-20260426-001508.md -->
# Launch Readiness Report

Branch: `launch-readiness-audit`
Date: `2026-04-26`
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
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_reports_router.py apps/api/tests/test_data_export.py apps/api/tests/test_patient_home_program_tasks_completion.py apps/api/tests/test_security.py -q --basetemp=.pytest_tmp -o cache_dir=.pytest_cache_local
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_documents_router.py -q --basetemp=.pytest_tmp_launch
node --check apps/web/src/pages-protocols.js
node --check apps/web/src/pages-patient.js
node --check apps/web/src/pages-patient-timeline.js
.\.venv\Scripts\python.exe -m py_compile apps/api/app/routers/patients_router.py apps/api/app/routers/patient_portal_router.py apps/api/app/routers/export_router.py apps/api/app/routers/media_router.py apps/api/app/routers/reports_router.py apps/api/app/routers/documents_router.py apps/api/app/routers/sessions_router.py
```

## Current Findings

### Confirmed passes

- Frontend production build passes when run outside the sandbox.
- Frontend unit test suite passes: `94 passed`.
- Backend smoke/governance/security slices pass:
  - `48 passed` in health + patient portal + home-program + evidence smoke
  - `16 passed` in auth + DeepTwin regression coverage
  - `64 passed` in security + production-hardening + 2FA + course-safety + consent slices
- Additional targeted launch-hardening slice passes:
  - `43 passed` in reports + data export + patient home-program completion + security regressions
  - `15 passed` in document CRUD/upload/download governance coverage
- Syntax checks pass for the launch-touch frontend files:
  - `pages-protocols.js`
  - `pages-patient.js`
  - `pages-patient-timeline.js`
- Python compile checks pass for the updated API routers.

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

4. Patient thread access allowed patient actors to probe other patients' message threads.
   Fix:
   - patient messaging on `/api/v1/patients/{patient_id}/messages` now resolves the authenticated patient identity and only permits that exact patient thread.
   - patient sends now require an assigned clinician instead of silently routing to the patient id.

5. Export endpoints allowed clinicians to request FHIR/BIDS exports for other clinicians' patients.
   Fix:
   - `/api/v1/export/fhir-r4-bundle` and `/api/v1/export/bids-derivatives` now enforce patient ownership for non-admin actors.

6. Media file serving did not re-check clinician ownership of the underlying patient.
   Fix:
   - `/api/v1/media/file/{file_ref}` now applies patient ownership checks for clinician/reviewer callers before streaming files.

7. Patient portal homework completion was not authoritative on reload.
   Fix:
   - patient-portal task listing now joins completion state from `PatientHomeProgramTaskCompletion`.
   - patient homework UI now uses `portalCompleteHomeProgramTask(...)` and rolls back optimistic state on save failure.

8. Patient MRI timeline silently fell back to fabricated demo data on fetch failure.
   Fix:
   - the page now shows explicit unavailable/empty states instead of injecting a fake timeline.

9. Protocol builder submit flow self-applied `reviewed` status and let off-label protocols route directly into course creation.
   Fix:
   - submit no longer upgrades governance to `reviewed`.
   - off-label protocol use is blocked until reviewed, and reviewed off-label use requires an explicit acknowledgement before entering the course wizard.

10. Reports API trusted report ids without enough ownership/patient checks, and create could fabricate a patient scope fallback.
    Fix:
    - persisted report creation now requires an explicit `patient_id`.
    - AI summary now requires report ownership and valid patient access.

11. Document records still had weak provenance and mutable signing fields.
    Fix:
    - document create/upload now verifies the referenced patient belongs to the clinician.
    - document status is restricted to controlled values.
    - `signed_at` is only accepted in signable states and is auto-stamped on `signed` / `completed`.
    - document metadata now stores provenance/governance fields for create/upload/update actions.
    - deploy docs and `.env.example` now document `DEEPSYNAPS_SECRETS_KEY` and `WEARABLE_TOKEN_ENC_KEY` as production requirements.

12. Some patient dashboard CTAs were still routing to placeholder or misleading destinations.
    Fix:
    - homework CTAs now route to the real homework surface.
    - “Book a consult” was relabeled/rerouted to the real sessions surface.
    - patient assistant/call copy is more explicit that this is decision support and call actions are requests, not instant live connections.

13. Additional cross-tenant backend actions were still too permissive.
    Fix:
    - media consent reads and clinician-side media write/delete actions now re-check patient ownership.
    - session creation now verifies the target patient belongs to the creating clinician.

### Residual risks

- The full backend suite still has not been completed end-to-end within this audit window; a broad run exceeded the current timeout and needs a longer unattended pass.
- The repo is very large, and many frontend pages still need explicit manual/functional review for empty/error/loading states and true backend wiring.
- Patient surfaces still contain demo/sample fallback behavior in other modules such as messages, virtual care, assessments, and care-team views; those need removal or explicit sandbox labeling before real clinic rollout.
- `get_authenticated_actor()` still defaults missing auth to `guest`, which is only safe as long as every sensitive route keeps explicit role gating.
- Local branch contains unrelated concurrent edits outside this launch tranche (`Makefile`, `package.json`, `apps/api/app/auth.py`, `apps/web/src/auth.js`, and a few untracked helper docs/scripts); they were not audited in this pass and should be reviewed before merge.
- README readiness claims remain broader than the verification evidence gathered in this pass.
