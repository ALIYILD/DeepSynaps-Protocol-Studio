# DeepSynaps Doctor-Ready Execution Plan

**Branch:** `doctor-ready/e2e-validation-and-hardening`  
**Mission:** end-to-end validation/hardening to reach *doctor-ready* demo status with supervised clinician review.

## Non-negotiables (constitution)

- **No fake clinical claims** (qEEG/MRI/ERP/DeepTwin/AI).
- **No “implemented” labels** without real code + tests + data path.
- **No native WinEEG / official LORETA** claims or reverse engineering.
- **Do not weaken** auth, cross-clinic gates, PHI handling, or audit trails.
- **Do not hide failures**: document and classify as blocker/non-blocker.
- **Separate concerns**: validation/hardening only; no unrelated feature work.

## Release Captain Checklist (this branch)

### 0) Freeze & scope guardrails
- Keep diffs minimal; isolate changes per area.
- Any change that touches auth/audit must include a short threat-model note.

### 1) Database / Alembic (Agent 1)
- Validate single head, upgrade path, and downgrade convention.
- Produce `docs/ai-audits/DOCTOR_READY_MIGRATION_REPORT.md`.

### 2) Backend security / tenant isolation (Agent 2)
- Run focused QEEG security audit tests and fix regressions without weakening coverage.
- Produce `docs/ai-audits/DOCTOR_READY_BACKEND_SECURITY_REPORT.md`.

### 3) QEEG-105 Phase 0 (Agent 3)
- Ensure registry is **exactly 105** (unique), endpoints exist, SSE stream exists, audit coverage is complete, PHI redaction meets EN/TR fixture bar.
- Produce `docs/ai-audits/QEEG_105_PHASE0_DOCTOR_READY_REPORT.md`.

### 4) qEEG / ERP / Source localization workflow coherence (Agent 4)
- Verify manual/raw workbench, ERP BIDS mapping, source-imaging caveats.
- Produce `docs/ai-audits/DOCTOR_READY_QEEG_ERP_SOURCE_REPORT.md`.

### 5) MRI / DeepTwin supervised demo readiness (Agent 5)
- Verify MRI demo gating + honest banners; DeepTwin persistence/audit + cross-clinic.
- Produce `docs/ai-audits/DOCTOR_READY_MRI_DEEPTWIN_REPORT.md`.

### 6) Frontend lint/build/unit + Playwright triage (Agent 6)
- Run `lint/build/test:unit/playwright`; classify failures; fix only real bugs or document env requirements.
- Produce `docs/ai-audits/DOCTOR_READY_FRONTEND_PLAYWRIGHT_REPORT.md`.

### 7) AI / PHI / claims audit (Agent 7)
- Search & fix dangerous wording; verify AI health surfaces; verify PHI redaction coverage; verify audit fields don’t carry PHI.
- Produce `docs/ai-audits/DOCTOR_READY_AI_COMPLIANCE_REPORT.md`.

### 8) Deployment / CI / release checklist (Agent 8)
- Create doctor-ready deployment checklist + final matrix.
- Produce:
  - `docs/deployment/doctor-ready-checklist.md`
  - `docs/ai-audits/DOCTOR_READY_FINAL_REPORT.md`

## Merge & sequencing policy

- Apply changes in the global order: DB → Security → QEEG-105 → qEEG/ERP → MRI/DeepTwin → Frontend → AI/Compliance → Deploy docs.
- Each area: 1 logical commit, descriptive message, tests recorded in report.
- If a failure is env-only (e.g. Playwright needs baseURL/auth), document required env + how to reproduce.

## Blocking criteria

- **Blocker** if any of:
  - multiple Alembic heads or `alembic upgrade head` fails
  - auth/cross-clinic gates regress
  - PHI can reach LLM surfaces without redaction gate
  - safety language regresses or “diagnosis” language appears
  - frontend build or unit tests fail (unless purely env-induced and documented)

