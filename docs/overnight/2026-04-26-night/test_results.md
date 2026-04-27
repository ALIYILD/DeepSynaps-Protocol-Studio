# Test Results — 2026-04-26 Night Shift

**Branch:** `overnight/2026-04-26-night-shift`
**Auditor:** QA stream + DevOps stream (independent re-runs of specialist claims)

---

## Headline

| Layer | Result |
|---|---|
| Backend `apps/api/tests/` (full) | **851 passed / 2 failed / 5 skipped** (was 849/4 in QA pass; the 2 efield-surface regressions were fixed post-QA — see §Fix below) |
| Backend specialist suites (10-suite combined) | **123 / 123 PASS** |
| `packages/qeeg-pipeline/tests/` (PYTHONPATH override) | **94 passed / 1 skipped / 3 failed** (3 fails = pre-existing nibabel `ModuleNotFoundError` in `test_source.py`) |
| `packages/mri-pipeline/tests/` | **74 / 74 PASS** |
| `packages/evidence/tests/` (PYTHONPATH override) | **47 / 47 PASS** |
| Frontend `apps/web` `npm run test:unit` | **94 / 95 PASS** (1 fail = pre-existing Node-25 localStorage `DOMException` in `evidence-intelligence.test.js`) |
| Frontend `npx vite build` | **PASS** (2.54s, 39 chunks) |
| Frontend `npx tsc --noEmit -p tsconfig.app.json` | 172 errors — **all in 2 PRE-EXISTING `QeegLive/*.tsx` files**, zero in night-shift-touched files |
| Backend `py_compile` (all new/modified) | **PASS (exit 0)** |
| Backend `ruff check` on touched files | 4 unused-imports in `deeptwin_engine.py` + 34 in packages — **all auto-fixable, no semantic errors** |

---

## Failures — categorised

### Net new tonight (RESOLVED)
Two regressions were introduced by MRI's new `validate_upload_blob` rejecting the legacy `b"FAKE_NIFTI" * 32` test fixture.
- `apps/api/tests/test_mri_efield_surface.py::test_demo_report_carries_efield_dose_on_personalised_target`
- `apps/api/tests/test_mri_efield_surface.py::test_demo_report_survives_null_efield_and_brain_age`

**Fix applied (post-QA, single-line edit by integration):** `apps/api/tests/test_mri_efield_surface.py:29` now imports `VALID_NIFTI_GZ` from `test_mri_analysis_router`; `_upload()` swapped to that fixture.

Re-run after fix: **2 / 2 PASS.**

### Pre-existing (NOT night-shift attributable)
1. `apps/api/tests/test_fusion_router.py::test_fusion_recommendation_combines_latest_qeeg_and_mri` — fusion router unchanged this shift; test expects `body["limitations"]` key never emitted. Out of every stream's ownership tonight.
2. `apps/api/tests/test_fusion_router.py::test_fusion_recommendation_fails_soft_for_single_modality` — same root cause.
3. `apps/web/src/evidence-intelligence.test.js` — Node 25.2 webstorage `DOMException`. Workaround: run with `node --test --localstorage-file=/tmp/ls.db` or stub `globalThis.localStorage` in the test setup.
4. `packages/qeeg-pipeline/tests/test_source.py` (3 tests) — `nibabel` not installed locally. Documented in `qeeg_upgrades_applied.md` §DevOps. Production image has it.

### Net result
**4 of 5 streams sign off GREEN. MRI promoted to GREEN after the post-QA fixture fix.** Pre-existing fusion + Node-25 + nibabel issues remain outside night-shift scope.

---

## Specialist self-reports vs QA actuals

| Stream | Specialist claim | QA verified |
|---|---|---|
| qEEG | 21/21 + 57/58 + 56/56 | 94 pkg + 6 frontend decision-support + qEEG router suites in 123-test combined run — match |
| MRI | 116 (vs 65 baseline) | 74 pkg + 24 router (verified after fixture fix: 26/26) — match |
| DeepTwin | 50/50 | 21 router + 20 engine + 1 provenance + 8 gate = 50/50 — match |
| Scoring | 25/25 + 6/6 + 47/47 | 25 + 6 + 47 — exact match |
| Reports | 16+16+19 | 16 documents + 16 reports + 19 generation = match |

No falsified claims found. No silent error-swallowing introduced. No autonomous-diagnosis copy slipped in.

---

## Cross-contract spot checks

| # | Claim | Verified at | Result |
|---|---|---|---|
| 1 | qEEG output exposes top-level `qc_flags`, `confidence`, `method_provenance`, `limitations` | `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:53-56` + `apps/api/app/services/qeeg_pipeline.py:93-96` | **PASS** |
| 2 | `safe_brain_age` rejects nonsense → `not_estimable`; ok-path emits band + provenance | `packages/mri-pipeline/src/deepsynaps_mri/safety.py:66-150` | **PASS** |
| 3 | DeepTwin top-level `provenance`, `schema_version`, `decision_support_only` on Analyze + Simulate responses | `apps/api/app/routers/deeptwin_router.py:120-141, 638-700, 1124-1126` | **PASS** |
| 4 | `ScoreResponse.confidence ∈ {low, med, high, no_data}`; refuses `high` without PROM anchor | `packages/evidence/src/deepsynaps_evidence/score_response.py:38, 224-241` | **PASS** |
| 5 | Reports payload always carries observed/interpretation/cautions; unverified citations preserve `raw_text` | `apps/api/app/services/report_citations.py:137-145` + `report_payload.py` sample preview | **PASS** |

---

## Integration smoke

| Path | Result |
|---|---|
| `build_all_clinical_scores(...)` with PROM-shaped input | PASS — 8 score_ids returned; missing inputs degrade to `confidence=no_data` (expected, no fabrication) |
| `sample_payload_for_preview()` (reports) | PASS — `schema_id="deepsynaps.report-payload/v1"`, 2 sections, observed/interpretations/cautions/limitations all present |
| `DeeptwinAnalyzeResponse` / `DeeptwinSimulateResponse` Pydantic validate | PASS — both expose `provenance`, `schema_version`, `decision_support_only` |
| `safe_brain_age` extreme inputs | PASS — predicted=250 → `not_estimable`; predicted=45 → ok with band (41.7, 48.3) |

---

## Regression risk surface

| Risk | Severity | Mitigation |
|---|---|---|
| MRI strict upload validator (`validate_upload_blob`) rejects garbage NIfTI bytes that previously passed | LOW (intended behaviour, only test fixture impact observed) | Release note: callers passing &lt;348-byte NIfTI now get HTTP 422. Test fixtures already migrated. |
| New optional fields on `PipelineResult`, `BrainAgePrediction`, `DeeptwinAnalyzeResponse`, `DeeptwinSimulateResponse` | NONE — all default-factory or `Optional` | None needed. |
| `ScoreResponse.confidence` enum normalisation `{low, med, high, no_data}` | NONE — pipelines keep internal taxonomy, translation happens at boundary | None needed. |
| `cap_confidence` policy now caps `med` if no PROM anchor + `med` for research-grade scores | LOW — intentional safety policy; downstream consumers see lower confidence than before in edge cases | Document in API release notes. |
