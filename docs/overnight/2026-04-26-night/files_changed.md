# Files Changed — 2026-04-26 Night Shift

**Branch:** `overnight/2026-04-26-night-shift`
**Compared against:** `main` (working-tree diff; no commits yet — all changes are staged/unstaged + untracked)
**Totals:** 29 modified files, 11 new files, 21 new docs/test files
**Diff stat:** +3,431 / -302 LOC across 29 modified files

---

## Stream 1 — qEEG Analysis (Stream Owner: qEEG specialist)

### Modified
| File | Δ |
|---|---|
| `packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py` | +239 / refactor |
| `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/asymmetry.py` | +80 |
| `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py` | +116 |
| `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py` | +62 |
| `packages/qeeg-pipeline/src/deepsynaps_qeeg/preprocess.py` | +135 |
| `apps/api/app/services/qeeg_pipeline.py` | +7 |
| `apps/web/src/pages-qeeg-analysis.js` | +158 |

### New (untracked)
- `packages/qeeg-pipeline/tests/test_clinical_summary_v2.py`
- `packages/qeeg-pipeline/tests/test_io_malformed.py`
- `packages/qeeg-pipeline/tests/test_preprocess_fallback.py`
- `apps/web/src/pages-qeeg-decision-support.test.js`

---

## Stream 2 — MRI Analysis

### Modified
| File | Δ |
|---|---|
| `apps/api/app/routers/mri_analysis_router.py` | +129 |
| `packages/mri-pipeline/src/deepsynaps_mri/__init__.py` | +25 |
| `packages/mri-pipeline/src/deepsynaps_mri/schemas.py` | +31 |
| `packages/mri-pipeline/src/deepsynaps_mri/structural.py` | +8 |
| `apps/api/tests/test_mri_analysis_router.py` | +239 |

### New (untracked)
- `packages/mri-pipeline/src/deepsynaps_mri/safety.py`
- `packages/mri-pipeline/src/deepsynaps_mri/validation.py`
- `packages/mri-pipeline/tests/test_safety.py`
- `packages/mri-pipeline/tests/test_validation.py`

---

## Stream 3 — DeepTwin (Digital Twin)

### Modified
| File | Δ |
|---|---|
| `apps/api/app/routers/deeptwin_router.py` | +300 |
| `apps/api/app/services/deeptwin_engine.py` | +198 |
| `apps/web/src/deeptwin/components.js` | +50 |
| `apps/web/src/deeptwin/safety.js` | +52 |
| `apps/web/src/pages-deeptwin.js` | +8 |
| `apps/api/tests/test_deeptwin_router.py` | +287 |

### New (untracked)
- `apps/api/app/services/deeptwin_decision_support.py`

---

## Stream 4 — Scoring / Risk Stratification

### Modified
| File | Δ |
|---|---|
| `apps/api/app/routers/risk_stratification_router.py` | +64 |
| `packages/evidence/src/deepsynaps_evidence/__init__.py` | +20 |

### New (untracked)
- `apps/api/app/services/risk_clinical_scores.py`
- `apps/api/tests/test_risk_clinical_scores.py`
- `packages/evidence/src/deepsynaps_evidence/score_response.py`

---

## Stream 5 — Reports / Render Engine

### Modified
| File | Δ |
|---|---|
| `apps/api/app/routers/reports_router.py` | +237 |
| `packages/render-engine/src/deepsynaps_render_engine/__init__.py` | +51 |
| `packages/render-engine/src/deepsynaps_render_engine/renderers.py` | +509 |
| `packages/generation-engine/src/deepsynaps_generation_engine/__init__.py` | +2 |
| `packages/generation-engine/src/deepsynaps_generation_engine/protocols.py` | +123 |
| `apps/web/src/pages-protocols.js` | +182 |
| `apps/api/tests/test_reports_router.py` | +196 |
| `apps/api/tests/test_documents_router.py` | +28 |

### New (untracked)
- `apps/api/app/services/report_payload.py`
- `apps/api/app/services/report_citations.py`
- `packages/render-engine/src/deepsynaps_render_engine/payload.py`

---

## Cross-cutting

### Modified
- `package-lock.json` — 197 lines removed/changed (workspace lockfile sync; no new top-level deps)

---

## Docs (untracked, this folder)

- `task_board.md` (orchestrator)
- `repo_map.md`, `module_inventory.json` (initial recon)
- `devops_env_baseline.md` (this DevOps stream — pre-shift)
- `qeeg_*` (4 files: current_state, best_practice_matrix, upgrades_applied, tests_added)
- `mri_*` (4 files: current_state, best_practice_matrix, upgrades_applied, tests_added)
- `digital_twin_*` (3 files: audit, best_practice, upgrades_applied) + `prediction_tests_added.md`
- `scoring_*` (3 files: audit, framework_upgrades, tests_added) + `score_api_contracts.md`
- `evidence_audit.md`
- `reports_upgrade_plan.md`, `reports_upgrades_applied.md`, `citations_and_export_notes.md`
- `deployment_notes.md` (this stream — Phase D4 deliverable)
- `files_changed.md` (this file)

### Alembic migrations
**`apps/api/alembic/versions/` — NO NEW MIGRATIONS this shift.** 49 existing files unchanged.
