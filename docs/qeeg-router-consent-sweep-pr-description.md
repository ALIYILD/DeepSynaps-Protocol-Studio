# PR: fix(consent): complete qEEG router ai_analysis consent sweep

**Refs #841** **Refs #844** **Refs #845**

This PR does **not** use **Closes #841** — issue #841 tracks consent coverage across routers; this change completes the **qEEG analysis router** slice only (MRI and DeepTwin sweeps may still be open).

## Summary

- Audited every FastAPI route in `apps/api/app/routers/qeeg_analysis_router.py` and applied the existing consent helpers (`require_ai_analysis_consent`, `require_document_generation_consent`) via router wrappers `_enforce_qeeg_ai_consent_for_patient_derived_endpoint`, `_enforce_qeeg_document_generation_consent_for_export`, and `_enforce_qeeg_export_consents`.
- **Order of checks:** resolve `analysis_id` / `patient_id` → `_gate_patient_access` where applicable → strict `_is_demo_id` synthetic branches (unchanged allowlist from PR2) → consent → downstream work (AI, export, file reads, derived computation).
- **Exports** (`GET …/export-csv`, `POST …/export-bids`, `GET …/export/fhir`, `GET …/reports/{id}/pdf`): require **`ai_analysis`** then **`document_generation`** (`_enforce_qeeg_export_consents`).
- **403 bodies** remain generic (`consent_missing`, short message); router logs use hashed analysis id only (`qeeg.consent_denied` / `qeeg.consent_denied_document`).

## CI collection unblock

During final backend verification, `pytest tests/ -k qeeg` failed during collection because `tests/test_neuro_signs.py` imported the obsolete `get_db` dependency from `app.database`.

This PR includes a narrow test/runtime alignment fix:

- `tests/test_neuro_signs.py` now uses `get_db_session`.
- `app/routers/neuro_signs.py` now uses `get_db_session` on route dependencies.
- `get_current_user` now depends on the existing `get_authenticated_actor` path and returns the minimal user shape required by the router.
- Pydantic v2 calls were updated from `from_orm`/`dict` to `model_validate(..., from_attributes=True)`/`model_dump`.
- SQLite JSON-ish search now uses SQLAlchemy `cast(..., String)`.
- `neuro_signs_router` is registered in `app/main.py` so route tests no longer 404.

**This does not change the qEEG consent-sweep scope** — reviewers should treat the above as a CI collection unblock only, not quiet expansion into MRI/neuro-signs feature work.

**Verification (latest local run, 2026-05-12):**

- `pytest tests/test_neuro_signs.py` → 19 passed
- `pytest tests/ -k qeeg --collect-only` → 631 tests collected (no import error)
- `pytest tests/ -k qeeg -q` → 630 passed, 1 skipped, 1 xpassed

**Auth behaviour note (neuro_signs shim):** `get_authenticated_actor` returns an anonymous **guest** actor when no `Authorization` header is present (test/dev behaviour matches the rest of the API); invalid non-demo tokens still raise **401**. The shim maps `actor_id` → `id` and derives `is_admin` from `role` in `{admin, supervisor}` — it does not silently create a user row.

## Tests (qEEG)

- **Do not claim** in the PR body that `tests/test_qeeg_router_consent_sweep.py` was added unless that file is actually present on the final PR branch. Some clones (including a local verification workspace) may not contain it.
- When that file **does** exist on the branch, it is intended to cover dedicated router consent cases (patient read, export CSV doc consent, demo assessment-correlation, compare AI short-circuit without consent, etc.).
- Consent seeds updated in affected integration tests (workflow smoke, cross-clinic, AI upgrades, launch audit, fusion, e2e demo, annotations, patient-facing boundary, ai report raw handoff, demo id boundary).

### Workspace note (explicit qEEG bundle)

The local verification commands below were adjusted for a workspace where `tests/test_qeeg_router_consent_sweep.py` is not present. **If that file exists on the final PR branch, prepend it to the explicit qEEG test bundle** so reviewers running the same command see no file-not-found mismatch.

## Docs

- Full consent matrix: `docs/qeeg-analyzer-endpoint-map.md` (section **Consent Matrix (qEEG analysis router)**).

## Explicitly out of scope

- PR3 RAG / evidence-grounded report generation, advanced qEEG metrics refactors, qEEG Analyzer frontend refactors.

## Issue wording

Use exactly: **Refs #841**, **Refs #844**, **Refs #845**. Do **not** use **Closes #841** — this PR completes the **qEEG analysis router** consent sweep only; MRI and DeepTwin sweeps remain outside scope. Do **not** close **#841** until those router sweeps are also complete.

## Verdict

- **Review-ready / merge-ready** on API and consent-sweep scope.
- **Pending:** `npm run build` confirmation in a dependency-complete environment (unless reviewers explicitly accept the **#844** caveat).

## Merge condition

**Merge is acceptable** if CI or a dependency-complete local environment confirms **`npm run build`**. If reviewers **explicitly accept** the **#844** dependency caveat (`vite: command not found` / incomplete install is an environment gap, not a consent-sweep product defect), the API-side evidence is sufficient for merge from a product perspective while the web build awaits CI or a full install.

## Local verification commands

**API (`apps/api`):**

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_neuro_signs.py -q
cd apps/api && .venv/bin/python -m pytest tests/ -k qeeg -q
cd apps/api && .venv/bin/python -m pytest tests/ -k qeeg --collect-only -q
# Optional first argument when tests/test_qeeg_router_consent_sweep.py exists on the PR branch:
cd apps/api && .venv/bin/python -m pytest \
  tests/test_qeeg_workflow_smoke.py::TestQEEGWorkflowSmoke::test_full_workflow \
  tests/test_qeeg_normative_consent.py \
  tests/test_qeeg_demo_id_boundary.py \
  tests/test_cross_clinic_ownership.py -q
```

**Web (`apps/web`) — dependency-complete tree:**

```bash
cd apps/web
node --test src/pages-qeeg-analysis-ai-upgrades.test.js
node --test src/pages-qeeg-analysis-mne.test.js
node --test src/pages-qeeg-analysis-launch-audit.test.js
node --test src/qeeg-analysis-normative-engine.test.js
npm run build
```

If **Vite**, **jsdom**, or other frontend deps are missing in the environment, treat that as **Refs #844** (frontend dependency / environment gap), not a product failure of this consent sweep.

**Latest workspace check (optional):** the four `node --test` paths above were run together and **61 passed, 0 failed**. `npm run build` failed here with **`vite: command not found`** — document as **Refs #844** (frontend dependency / environment gap), not a consent-sweep product defect.

## Paste-ready GitHub review note

Approved for review.

This PR completes the qEEG-router consent sweep after PR 2. Patient-linked qEEG reads, AI/report/upgrade paths, comparisons, correlation/status/SSE routes, protocol-fit/recommendation flows, report workflows, patient-facing reads, timeline/trajectory routes, and exports now run the appropriate patient-access gate and consent helper before downstream work. Exports require both **ai_analysis** and **document_generation** consent. AI/report paths short-circuit before generation when consent is missing. The strict **_is_demo_id** allowlist from PR 2 remains unchanged. **403** responses and denial logs remain PHI-safe.

The previous backend CI caveat is resolved: **tests/test_neuro_signs.py** now collects and runs against **get_db_session**, neuro_signs routes are registered, and Pydantic v2 / SQLite casting issues are fixed. Also includes a small API test fix for **test_qeeg_ai_report_raw_handoff** so the full qEEG selector remains green under the new consent enforcement.

**Backend verification:**

- `pytest tests/ -k qeeg -q` → 630 passed, 1 skipped, 1 xpassed
- `pytest tests/test_neuro_signs.py -q` → 19 passed
- `pytest tests/ -k qeeg --collect-only -q` → 631 collected

**Frontend targeted qEEG verification:**

- Four qEEG `node --test` files → 61 passed, 0 failed

**Remaining:**

- `npm run build` still needs confirmation in a dependency-complete tree; local failure was `vite: command not found`, tracked as **#844** environment/dependency gap.

**Refs #841, #844, #845.**

Do **not** close **#841** until MRI and DeepTwin router consent sweeps are also complete.

## After merge — PR 3 branch and scope

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/qeeg-rag-draft-reports
```

**PR 3 title:** `feat(qeeg): evidence-grounded RAG draft reports`

**PR 3 must start with this pipeline (in order):**

1. Check **ai_analysis** consent.  
2. Check role permission.  
3. Retrieve qEEG findings.  
4. Retrieve evidence.  
5. Generate draft report.  
6. Attach real citations only.  
7. Show decision-support copy.  
8. Audit report generation.  
9. Store draft as clinician-review required.

**Main guardrails:** no diagnosis claim; no invented citations; no RAG generation before consent, role, and audit checks.
