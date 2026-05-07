# qEEG Launch Task Board

Purpose: track qEEG launch-readiness work using the DeepSynaps Go-Live Team
operating model.

Related:
- `docs/go-live-agent-team.md`
- `config/agent-team/go-live-team.json`

## Team

- Lead: scope, priority, task creation, status ownership
- Implementation: one narrow change set at a time
- QA: independent verification and release recommendation
- Human Release Owner: final deploy and rollback approval

## Status Model

Use only these statuses:

- `queued`
- `in_progress`
- `qa_review`
- `ready_for_release`
- `blocked`
- `done`

## Definition Of Done

A qEEG launch task is `done` only when all of the following are true:

1. Scope is complete and limited to the task card.
2. Changed files are listed explicitly.
3. Exact verification commands are listed explicitly.
4. Verification outcomes are recorded, including failures or skips.
5. QA review is complete with one of:
   - `GO`
   - `GO_WITH_CONCERNS`
   - `NO_GO`
6. There is no unresolved `NO_GO` finding.
7. Rollback note is documented for launch-critical behavior.
8. Lead has updated the task status and published the outcome.

Do not mark a task `done` because code was merged, because tests were started,
or because the UI "looks right".

## Release Readiness Gate

No qEEG work is `ready_for_release` unless the task card includes:

- changed files
- exact commands run
- command outcomes
- QA recommendation
- rollback note when behavior changed

## Launch Objective

Make the qEEG workflow fully release-ready for:

1. EEG upload and ingest
2. MNE-backed analysis execution
3. raw-data manual review
4. cleaning version save and reprocess
5. AI-assisted review with honest gating
6. normative and source-map disclosure
7. HTML and PDF reporting

## Current Risks

- runtime scientific dependencies missing in some environments
- local test environment mismatch blocks reliable verification
- current upload flow only supports standalone single-file formats
- normative DB may still be toy or deployment-dependent
- some AI/reporting paths are gated, fallback, or stub-capable
- worker/Celery path was under-declared relative to qEEG job requirements
- some frontend workbench states are placeholder or degraded

## Active Board

```text
TASK: qEEG runtime dependency lock and environment fix
Owner: Implementation
Verifier: QA
Scope: Align Python/runtime stack for qEEG execution and testing. Fix the SQLAlchemy/runtime mismatch. Install and pin required qEEG scientific/reporting dependencies in the intended environment.
Acceptance criteria:
- qEEG API tests boot successfully
- qEEG pipeline tests run in the intended environment
- capability endpoint reports expected active/fallback states
- MNE pipeline smoke run completes on a real sample file
Files expected:
- apps/api/pyproject.toml or equivalent dependency manifests
- apps/api/Dockerfile
- apps/worker/pyproject.toml
- worker/runtime config as needed
- qEEG install docs/runbooks as needed
Verification required:
- exact install/version commands
- qEEG API router test command
- qEEG pipeline test command
- one capability endpoint smoke check
Status: in_progress
Blockers: full pytest boot still blocked on the local Python 3.8 default env; end-to-end runtime verification still needs a target env with the complete scientific stack

Implementation evidence:
- Changed files:
  - apps/api/Dockerfile
  - apps/worker/pyproject.toml
  - .github/workflows/ci.yml
  - apps/worker/README.md
  - docs/deployment/ci-validation.md
- Actions:
  - added editable install of packages/qeeg-pipeline[reporting,source,rag] to the API image so the deployed API path actually carries the real MNE-backed qEEG package
  - declared celery, deepsynaps-api, and deepsynaps-qeeg in the worker package because async qEEG jobs delegate into API-layer qEEG services
  - updated worker CI install steps and validation docs so green worker tests are not mistaken for real qEEG-worker readiness when API/qEEG deps are absent
- Commands run:
  - uv run python -V
  - uv run python -m py_compile apps/api/app/routers/qeeg_analysis_router.py apps/api/app/services/qeeg_pipeline_job.py
- Outcomes:
  - Python runtime resolved to 3.11.14
  - py_compile completed successfully for the targeted qEEG router/job files
QA recommendation:
Release decision:
Rollback note:
- Revert the Dockerfile qEEG package install line and worker dependency declarations if image size, resolver conflicts, or native-dependency issues require returning to the old fallback-only behavior
```

```text
TASK: qEEG supported-format upload parity
Owner: Implementation
Verifier: QA
Scope: Align frontend copy, backend upload allowlist, and pipeline ingest support for EDF/BDF/FIF handling in the current single-file flow.
Acceptance criteria:
- allowed formats are consistent across UI, router validation, and docs
- unsupported formats fail clearly
- supported formats pass validation and queue correctly
Files expected:
- apps/api/app/routers/qeeg_analysis_router.py
- apps/web/src/pages-qeeg-analysis.js
- apps/web/src/pages-qeeg-launcher.js
- apps/web/src/qeeg-upload-workflow.js
- docs/qeeg/*.md as needed
Verification required:
- unit or router tests for upload validation
- smoke upload per supported standalone type or fixture-backed equivalent
Status: in_progress
Blockers: current single-file upload flow still does not support companion-file formats such as BrainVision triplets or multi-file EEGLAB datasets

Implementation evidence:
- Changed files:
  - apps/api/app/routers/qeeg_analysis_router.py
  - apps/web/src/pages-qeeg-analysis.js
  - apps/web/src/pages-qeeg-launcher.js
  - apps/web/src/qeeg-upload-workflow.js
  - apps/web/src/pages-qeeg-launcher.test.js
  - apps/web/src/qeeg-upload-workflow.test.js
  - docs/qeeg/deepsynaps-qeeg-function-inventory.md
- Actions:
  - narrowed upload claims and allowlist to standalone single-file uploads
  - added explicit error/copy that companion-file imports are not yet supported in this flow
  - corrected tests to match the narrowed standalone upload contract
- Commands run:
  - node --test apps/web/src/pages-qeeg-launcher.test.js
  - node --test apps/web/src/qeeg-upload-workflow.test.js
- Outcomes:
  - launcher tests passed
  - upload workflow tests passed
QA recommendation:
Release decision:
Rollback note:
- Restore the broader copy/allowlist only if a verified companion-file upload flow is implemented and tested end to end
```

```text
TASK: End-to-end qEEG clinician workflow smoke
Owner: Implementation
Verifier: QA
Scope: Verify upload -> analyze -> raw review -> save cleaning version -> reprocess -> manual finding -> report generation.
Acceptance criteria:
- one full clinician path succeeds in preview/intended environment
- all degraded states are explicit and non-misleading
- no auth or ownership gap blocks the core workflow
Files expected:
- tests/e2e or smoke scripts
- docs/runbooks if workflow steps need codifying
Verification required:
- end-to-end smoke commands
- screenshots or structured output notes
- report export check
Status: queued
Blockers: environment/runtime not yet stable enough for reliable smoke verification

Implementation evidence:
QA recommendation:
Release decision:
Rollback note:
```

```text
TASK: Normative DB and source-localization truth labeling
Owner: Lead
Verifier: QA
Scope: Ensure all qEEG surfaces honestly disclose normative DB status, source-localization method, quality gates, and limitations.
Acceptance criteria:
- toy norms cannot be mistaken for validated norms
- source-localized output is clearly marked with method and caveats
- report and UI copy match real deployment state
Files expected:
- apps/api/app/routers/qeeg_capabilities_router.py
- apps/web/src/pages-qeeg-analysis.js
- apps/web/src/pages-qeeg-raw-workbench.js
- report templates/docs as needed
Verification required:
- capability payload review
- UI text review
- sample report review
Status: queued
Blockers: deployment-specific norm DB state not yet locked

Implementation evidence:
QA recommendation:
Release decision:
Rollback note:
```

```text
TASK: AI assist gating and clinician-safety hardening
Owner: Implementation
Verifier: QA
Scope: Make stub/fallback AI states visible, ensure protocol/off-label safety labeling is explicit, and prevent AI outputs from appearing autonomous.
Acceptance criteria:
- every AI surface shows clinician-review-required messaging
- stub/fallback capability is not presented as full readiness
- protocol recommendation surfaces off-label/investigational flags clearly
Files expected:
- apps/api/app/services/qeeg_ai_bridge.py
- apps/api/app/routers/qeeg_analysis_router.py
- apps/web/src/qeeg-ai-panels.js
- apps/web/src/qeeg-protocol-fit.js or related UI surfaces
Verification required:
- API response checks for stub/fallback paths
- frontend tests for visible gating and warning states
Status: in_progress
Blockers: backend AI envelopes still vary by endpoint, and rendered analysis panels still need broader stub-state surfacing beyond action-button feedback

Implementation evidence:
- Changed files:
  - apps/web/src/pages-qeeg-analysis.js
  - apps/web/src/qeeg-protocol-fit.js
- Actions:
  - action buttons now inspect success and is_stub on 200-responses before showing success messaging
  - protocol-fit UI now surfaces Off-Label / Investigational more explicitly
- Commands run:
  - uv run python -m py_compile apps/api/app/routers/qeeg_analysis_router.py apps/api/app/services/qeeg_pipeline_job.py
- Outcomes:
  - targeted Python files compile under Python 3.11
QA recommendation:
Release decision:
Rollback note:
- Remove the frontend stub/result gating only if backend endpoints are changed to return hard HTTP failures instead of structured 200 envelopes
```

```text
TASK: qEEG reporting and export hardening
Owner: Implementation
Verifier: QA
Scope: Ensure printable HTML/PDF reporting is complete, dependency-backed, and includes quality, provenance, limitations, and manual-review context.
Acceptance criteria:
- completed qEEG analysis can produce HTML and PDF in target environment
- report content matches stored analysis outputs
- report includes limitations, provenance, and clinician-review disclaimer
Files expected:
- apps/api/app/services/qeeg_pdf_export.py
- packages/qeeg-pipeline/src/deepsynaps_qeeg/report/*
- apps/api/app/templates/qeeg_brain_map_report.html
- apps/web/src/pages-qeeg-analysis.js
Verification required:
- report generation smoke command
- HTML render check
- PDF render check
- sample payload comparison
Status: queued
Blockers: WeasyPrint and related report dependencies are still not proven end-to-end in the intended runtime

Implementation evidence:
QA recommendation:
Release decision:
Rollback note:
```

```text
TASK: qEEG launch claim sheet and release brief
Owner: Lead
Verifier: QA
Scope: Convert verified readiness state into approved internal/external language, known limitations, and release decision support for the Human Release Owner.
Acceptance criteria:
- approved claims match verified behavior exactly
- known limitations are documented
- release brief includes rollback path and unresolved concerns
Files expected:
- docs/qeeg/*.md
- docs/agents/release-brief.md or linked release note
Verification required:
- trace each product claim to evidence from completed tasks
- QA sign-off on claim accuracy
Status: queued
Blockers: depends on upstream verification tasks

Implementation evidence:
QA recommendation:
Release decision:
Rollback note:
```

## Task Card Template

Copy this block for each new qEEG launch task.

```text
TASK:
Owner:
Verifier:
Scope:
Acceptance criteria:
Files expected:
Verification required:
Status:
Blockers:

Implementation evidence:
QA recommendation:
Release decision:
Rollback note:
```
