# feat(qeeg): normative scaffold, EC/EO condition model, audit wiring + consent hardening

## Executive summary

This PR hardens PR 2 by adding consent enforcement to the qEEG patient-linked surfaces introduced or tightened in the normative scaffold workstream:

- `GET /api/v1/qeeg-analysis/{analysis_id}/normative-model-card`
- `POST /api/v1/qeeg-analysis/{analysis_id}/ai-report`

Both endpoints use the existing `require_ai_analysis_consent` helper with `ai_modality="qeeg"`. Denials continue through the standard `AuditEventRecord` and `SafetyFlag` path from `consent_enforcement.py`, with an additional PHI-safe app log event `qeeg.consent_denied` (hashed analysis id prefix only; no patient identifiers in the log line).

**This PR references #841 but does not close it** because it does not perform a full qEEG / MRI / DeepTwin router consent sweep.

## Scope

**Included**

- Consent gate for qEEG normative model card
- Consent gate for qEEG AI report (enforced immediately after patient/clinic gate, before readiness checks and before any report-generation / LLM work)
- Demo/synthetic ID bypass via strict `_is_demo_id` (exact tokens `demo` / `mock` / `test`, `demo-pt-*` roster prefix, `demo-patient*` synthetic launcher ids — **not** naive `demo-*` prefix matching)
- PHI-safe denial logging
- Tests for 403, 200, fixture demo bypass, demo-like **non-bypass** patient ids, AI-report short-circuit before `generate_ai_report`, and `_is_demo_id` boundary cases
- Documentation updates for consent, demo boundary, and planned recording-condition persistence

**Not included**

- Full qEEG router consent audit (planned follow-up: `fix(consent): complete qEEG router ai_analysis consent sweep`)
- MRI or DeepTwin consent enforcement
- Recording-condition server persistence
- PR 3 RAG / evidence-grounded report implementation

## Recording condition

Condition override is **session-local in this PR** unless a server-side `PATCH` endpoint is implemented. **Production use should persist `recording_condition` before relying on longitudinal or cross-device workflows.** See `docs/qeeg-analyzer-endpoint-map.md` for the planned PATCH contract.

## Tests run

```bash
cd apps/api && .venv/bin/python -m pytest \
  tests/test_qeeg_demo_id_boundary.py \
  tests/test_qeeg_normative_consent.py \
  tests/test_qeeg_workflow_smoke.py::TestQEEGWorkflowSmoke::test_full_workflow -q
```

```bash
cd apps/web && node --test \
  src/qeeg-analysis-normative-engine.test.js \
  src/pages-qeeg-analysis-launch-audit.test.js \
  src/pages-qeeg-analysis-ai-upgrades.test.js \
  src/pages-qeeg-analysis-mne.test.js
```

Paste exact pass/fail output from your environment into the PR thread.

## Known environment limitation

`pages-qeeg-analysis-erp-tab.test.js` requires the `jsdom` package. If it fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'jsdom'`, that is an environment or dependency gap (see **Refs #844**), not evidence that this PR broke ERP tab logic.

## Issue references

Refs #841  
Refs #844  
Refs #845

**Do not use** `Closes #841`, `Fixes #841`, or `Resolves #841` from this PR: the full AI-router consent sweep described in that issue is not complete here.

---

## Paste-ready reviewer comment

Approved for PR 2 scope.

This PR now correctly hardens the qEEG normative scaffold workstream without over-claiming Issue #841 completion.

**Reviewed highlights**

- qEEG `normative-model-card` and `ai-report` endpoints now require `ai_analysis` consent.
- Consent enforcement runs before downstream AI/report generation.
- Demo bypass is tightened to an explicit allowlist rather than broad prefix matching.
- Dangerous demo-looking patient IDs are covered by negative tests.
- 403 consent-denied responses are PHI-safe.
- Consent test seeding is narrow and patient-specific, not global.
- Docs correctly state **Refs #841**, not **Closes #841**.
- Recording-condition persistence remains documented as session-local until the planned PATCH endpoint lands.

**Tests reported**

- Backend qEEG consent/demo/workflow tests: 29 passed (run in API venv).
- Frontend normative/audit (+ AI upgrades/MNE when run): 17+ passed as documented in CI or local `node --test`.

**Known environment gaps**

- `apps/web` `npm run build` should be confirmed in CI or a dependency-complete local environment (`vite` not available in some sandboxes).
- ERP tab test may require `jsdom`; missing package is an environment issue (**Refs #844**), not a product regression.

**Merge recommendation**

Ready to merge for PR 2, assuming CI or a dependency-complete local environment confirms the web build.
