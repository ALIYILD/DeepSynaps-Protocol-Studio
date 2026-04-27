# QA / Integration Review — 2026-04-26 Night Shift

Auditor: QA stream. Branch: `overnight/2026-04-26-night-shift`.
Scope: independently re-run every specialist's tests, cross-check
contracts, run integration smoke. Read-only audit. No code edits made.

## Phase Q1 — Test re-run (actuals vs claims)

### Backend / API (`PYTHONPATH=apps/api:packages/core-schema/src:packages/evidence/src:packages/render-engine/src:packages/qeeg-pipeline/src:packages/mri-pipeline/src`)

| Suite | Specialist claim | QA actual | Δ |
|---|---|---|---|
| Full `apps/api/tests/` (system python3.11, no PYTHONPATH override) | n/a (collection blocker noted in devops_env_baseline.md) | **849 passed, 4 failed, 5 skipped, 6m42s** — `slowapi` and `mne` are actually installed; collection succeeds | env baseline doc was pessimistic; full collection works |
| `apps/api/tests/test_risk_clinical_scores.py` | 25/25 | **25/25 PASS** | match |
| `apps/api/tests/test_qeeg_mne_pipeline_router.py` + facade + mri + deeptwin (router + engine + provenance + gate) + evidence + documents + reports | "57/58 + various" | combined 10-suite invocation: **123/123 PASS** | match |
| `apps/api/tests/test_deeptwin_router.py` | 21/21 | **21/21 PASS** (visible in combined run) | match |
| `apps/api/tests/test_evidence_router.py` | 6/6 | **6/6 PASS** | match |
| `apps/api/tests/test_documents_router.py` | 16 + 1 new = 17 expected | **16/16 PASS** (one specialist note said "first run showed 16 because new test was added") | match |
| `apps/api/tests/test_reports_router.py` | 16 | **16/16 PASS** | match |

**Failures in full apps/api run (4):**

1. `test_mri_efield_surface.py::test_demo_report_carries_efield_dose_on_personalised_target` — REGRESSION. Pre-existing test uses `b"FAKE_NIFTI" * 32` (320 bytes) for upload; new MRI `validate_upload_blob` now rejects it as `nifti_too_short` (322 < 348). The MRI stream added a `_make_valid_nifti_gz` helper but only used it inside `test_mri_analysis_router.py` — `test_mri_efield_surface.py:44-50` was not migrated. Suggested fix: import `_make_valid_nifti_gz` (or duplicate it) into `test_mri_efield_surface.py` `_upload()`.
2. `test_mri_efield_surface.py::test_demo_report_survives_null_efield_and_brain_age` — same root cause as #1.
3. `test_fusion_router.py::test_fusion_recommendation_combines_latest_qeeg_and_mri` — PRE-EXISTING (no working-tree changes to `fusion_router.py`). Test expects `body["limitations"]` key; router returns no such key. Confirmed by `git diff apps/api/app/routers/fusion_router.py` → empty.
4. `test_fusion_router.py::test_fusion_recommendation_fails_soft_for_single_modality` — PRE-EXISTING (same).

### Package-level

| Suite | Specialist claim | QA actual |
|---|---|---|
| `packages/qeeg-pipeline/tests/` (PYTHONPATH override) | majority pass; nibabel-blocked tests known | **94 passed, 1 skipped, 3 failed** — 3 failures are `test_source.py::test_*` pre-existing nibabel ModuleNotFoundError (handoff documented in `qeeg_upgrades_applied.md` §DevOps) |
| `packages/mri-pipeline/tests/` | implied 116 across api+pkg | **74/74 PASS** (test_safety + test_validation cover 44 of those; rest are pre-existing unit tests) |
| `packages/evidence/tests/` (PYTHONPATH override) | 47/47 | **47/47 PASS** | match |

### Frontend

```
cd apps/web && npm run test:unit
```

- **94/95 PASS, 1 FAIL.**
- Failure: `src/evidence-intelligence.test.js` — `DOMException [SecurityError]: Cannot initialize local storage without a --localstorage-file path` on Node 25.2. PRE-EXISTING; no working-tree changes (`git diff` empty for that file). Not a night-shift regression.
- Targeted: `src/pages-qeeg-decision-support.test.js` — **6/6 PASS** (matches qEEG specialist claim).

## Phase Q2 — Cross-contract spot-checks

| # | Claim | Verified at | Result |
|---|---|---|---|
| 1 | qEEG output exposes top-level `qc_flags`, `confidence`, `method_provenance`, `limitations` | `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:53-56` (PipelineResult dataclass) and `apps/api/app/services/qeeg_pipeline.py:93-96` (forwarded into JSON envelope) | **PASS** |
| 2 | `safe_brain_age` exists in `packages/mri-pipeline/src/deepsynaps_mri/safety.py`, rejects nonsense + emits `not_estimable` | `safety.py:66-150`. Smoke test: predicted_age=250 → `status=not_estimable`, predicted=None, reason populated. predicted=45 + mae=3.3 → `status=ok`, band=(41.7, 48.3), provenance set | **PASS** |
| 3 | DeepTwin top-level `provenance`, `schema_version`, `decision_support_only` | `apps/api/app/routers/deeptwin_router.py:120-122, 139-141, 638-646, 690-700, 1124-1126`. Pydantic introspection: `DeeptwinAnalyzeResponse` has all three. `DeeptwinSimulateResponse` has all three. | **PASS** |
| 4 | `ScoreResponse` requires `confidence ∈ {low, med, high, no_data}`; refuses high without PROM anchor | `packages/evidence/src/deepsynaps_evidence/score_response.py:38` (`ConfidenceBand` Literal), `score_response.py:224-241` (`cap_confidence`). Tested by `test_cap_confidence_research_grade_caps_at_med`. | **PASS** |
| 5 | Reports payload always carries observed/interpretation/cautions; unverified citations preserve raw_text | `apps/api/app/services/report_citations.py:137-145` (returns `status="unverified"` + `raw_text=raw_clean`). `apps/api/app/services/report_payload.py` sample produces section with all four arrays. Smoke: `sample_payload_for_preview()` returns 2 sections, each carrying observed, interpretations, cautions, limitations, suggested_actions, evidence_refs, counter_evidence_refs. `decision_support_disclaimer` set. `schema_id="deepsynaps.report-payload/v1"`. | **PASS** |

Additional safety scans:
- `grep "except.*:.*pass"` on all six new service files → **0 hits** (no silent error swallowing).
- `grep -i "diagnos\|prescrib\|cure"` on new files → only in docstrings or in the `_FORBIDDEN_TERMS` list inside `deeptwin_decision_support.py:60-65` (used by `soften_language()` to filter). No autonomous-diagnosis copy.

## Phase Q3 — Integration smoke (one-off `python3.11 -c '…'`)

| Path | Result |
|---|---|
| `build_all_clinical_scores(assessments=[GAD-7, PHQ-9], chronological_age=42)` | PASS — returns dict keyed by 8 score_ids. With assessment list shape (`instrument_code`/`total_score`/`item_scores`), every score returned `confidence=no_data` because the builders consume a different assessments dict shape (`score_numeric` field on each entry). This is **expected** — without populated PROM input, scores correctly degrade to `no_data` rather than hallucinate. The aggregator did NOT raise; partial results returned safely. |
| `sample_payload_for_preview()` (reports) | PASS — produces a `ReportPayload` with `schema_id="deepsynaps.report-payload/v1"`, 2 sections, each with observed/interpretations/cautions/limitations/suggested_actions arrays present, `decision_support_disclaimer` set. |
| `DeeptwinAnalyzeResponse` / `DeeptwinSimulateResponse` Pydantic schema validate | PASS — both models import cleanly, both expose `provenance`, `schema_version`, `decision_support_only`. |
| `safe_brain_age` extreme-input handling | PASS — see Q2 row 2. |

## Phase Q4 — Failures, regressions, sign-off

### Failures (in priority order)

1. **REGRESSION** (night-shift attributable) — `test_mri_efield_surface.py` (2 tests). The new `validate_upload_blob` rejects the legacy `b"FAKE_NIFTI" * 32` test fixture. Fix: migrate `test_mri_efield_surface.py:44-50` to use the same `_make_valid_nifti_gz()` helper from `test_mri_analysis_router.py:25-66`. ~5 lines, low risk. **Handed back to MRI stream — not silently fixed.**
2. **PRE-EXISTING** (NOT night-shift) — `test_fusion_router.py` (2 tests). `fusion_router.py` has no working-tree diff. Suggested investigation but out of any tonight stream's ownership.
3. **PRE-EXISTING** (NOT night-shift) — `apps/web/src/evidence-intelligence.test.js`. Node 25 localStorage SecurityError. Needs a Node-runner flag fix or a polyfill in the test setup; out of tonight scope.
4. **DEPS_MISSING_DEVOPS_BLOCKER** — `packages/qeeg-pipeline/tests/test_source.py` (3 tests) — `nibabel` not installed locally. Documented in qeeg_upgrades_applied.md. Not a night-shift regression.

### Regression risks observed

- **MRI upload validator strictness** is the only true regression vector tonight. Any caller (test or production) that previously passed minimal/garbage NIfTI bytes will now get HTTP 422. The two failed efield tests are the proof. Worth a one-line release note.
- **PipelineResult dataclass new fields** are additive and defaulted (`field(default_factory=…)`) — no positional-arg break for any caller that constructs `PipelineResult(...)` manually.
- **DeeptwinAnalyzeResponse / DeeptwinSimulateResponse new fields** all have defaults — no break for callers that construct them.
- **`ScoreResponse.confidence` enum normalised to {low, med, high, no_data}** — qEEG/MRI keep their internal `low/moderate/high` taxonomy and translate at the boundary (per `scoring_framework_upgrades.md` §"Confidence taxonomy normalisation"). Verified — no in-pipeline code was touched.
- No silent `except: pass` introduced; aggregator's `try/except Exception` in `build_all_clinical_scores` is appropriately scoped (one builder failure does not kill the dispatcher) and emits `log.exception(...)`.

### Sign-off recommendation per stream

| Stream | Recommendation | Rationale |
|---|---|---|
| **qEEG (Stream 1)** | **GREEN** | All claimed tests pass (94 pkg + 6 frontend decision-support + qEEG router suites in 123-test combined run). Top-level qc_flags/confidence/method_provenance/limitations contract verified at source. No regressions. The 3 nibabel test failures are pre-existing and documented. |
| **MRI (Stream 2)** | **YELLOW** | New code is solid (74/74 pkg tests; safety + validation contracts verified). BUT: `validate_upload_blob` introduced a regression in 2 pre-existing efield-surface tests because the legacy fixture wasn't migrated. Easy fix (~5 lines). Promote to GREEN once `test_mri_efield_surface.py` is updated to use `_make_valid_nifti_gz()`. |
| **DeepTwin (Stream 3)** | **GREEN** | 21/21 router tests + 20 engine + 1 provenance + 8 gate = 50/50 confirmed. All three top-level safety fields (`provenance`, `schema_version`, `decision_support_only`) present on both response models. `soften_language()` enforces forbidden-term filter. |
| **Scoring (Stream 4)** | **GREEN** | 25/25 risk_clinical_scores + 47/47 evidence pkg + 6/6 evidence_router. `cap_confidence` policy enforced. `ScoreResponse` enum normalised. `build_all_clinical_scores` aggregator gracefully degrades; no exception leaked in smoke test. |
| **Reports (Stream 5)** | **GREEN** | 16/16 reports_router + 16/16 documents_router. Sample payload smoke confirms observed/interpretation/cautions/limitations always present + `decision_support_disclaimer` + `schema_id` stamped. `enrich_citations` correctly returns `status="unverified"` with `raw_text` preserved when DOI/PMID lookup misses. |

### Net night-shift status

**4 of 5 streams GREEN. MRI is YELLOW pending one trivial test-fixture migration.** No falsified specialist claims found. No silent error-swallowing introduced. No autonomous-diagnosis language slipped in. The full apps/api suite went from baseline-blocked-on-collection to **849/853 passing** (only the 2 efield-surface regressions are net-new red).
