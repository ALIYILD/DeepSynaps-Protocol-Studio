# Doctor-ready MRI + DeepTwin Report (Agent 5)

Branch: `doctor-ready/e2e-validation-and-hardening`  
Date: 2026-05-05  
Scope: MRI Analyzer demo flow + DeepTwin clinical workspace (decision-support only)

## Tests run

### Backend (apps/api)

```bash
cd /workspace/apps/api
python3 -m pytest -q -n 0 \
  tests/test_mri_analysis_router.py \
  tests/test_mri_pipeline_facade.py \
  tests/test_mri_uat_scenarios.py \
  tests/test_mri_clinical_workbench.py \
  tests/test_deeptwin_router.py \
  tests/test_deeptwin_persistence.py \
  tests/test_deeptwin_simulation_gate.py \
  tests/test_deeptwin_engine_provenance.py
```

- Result: **PASS** (`103 passed`)

### Frontend unit tests (apps/web, Node 18 compatible subset)

```bash
cd /workspace/apps/web
node --test \
  src/pages-mri-analysis.test.js \
  src/pages-mri-analysis-qc.test.js \
  src/pages-mri-analysis-compare.test.js \
  src/pages-mri-analysis-brainage.test.js
```

- Result: **PASS** after one test import fix (see “Issues fixed” below).

## MRI demo readiness (requirements)

- **MRI Analyzer page loads in demo mode**: covered by `src/pages-mri-analysis.test.js` (demo report auto-populates).
- **Demo banner explains `MRI_DEMO_MODE=1` sample report**: confirmed in `apps/web/src/pages-mri-analysis.js` (`renderDemoLiveBanner()` explicitly states the API returns the canned sample while `MRI_DEMO_MODE=1`).
- **Run analysis flow**:
  - UI banner describes live call `POST /api/v1/mri/analyze` when signed in with clinician demo.
  - Offline demo note present (“offline sample report”) when not signed in / session absent.
- **Report renders**: unit tests cover full-view renderers, QC cards, brain-age card (when present), compare modal rendering, and “no banned clinical-claim words” checks.
- **No claim of real FreeSurfer/GPU segmentation in demo**:
  - Demo path is explicitly labeled as canned / offline sample; no “GPU required” or “FreeSurfer computed” marketing language was found in the demo banner.
  - Backend demo-mode gate is explicit: `_demo_mode_enabled()` returns true when `MRI_DEMO_MODE=1` or pipeline is absent, and then loads `load_demo_report()`.
- **Docs mention `MRI_DEMO_MODE=0` requirements**:
  - Deployment checklist (`docs/deployment/doctor-ready-checklist.md`) already documents `MRI_DEMO_MODE` behavior and “real pipeline” requirements at a high level.

## DeepTwin doctor-demo readiness (requirements)

- **Data source map uses real counts where available**: validated indirectly via DeepTwin engine/persistence tests and router tests; endpoints compute coverage and return structured payloads rather than hard-coded demo-only claims.
- **Analysis/simulation runs persist**: covered by `tests/test_deeptwin_persistence.py`.
- **Clinician notes persist**: covered by `tests/test_deeptwin_router.py` and persistence tests.
- **Review actions require backend confirmation**: router tests exercise review gates.
- **Audit events exist for create/review/view actions**: DeepTwin router explicitly uses audit logging (`create_audit_event`) and tests cover governed behaviors.
- **Cross-clinic access blocked**: DeepTwin router uses cross-clinic gate (`require_patient_owner` after resolving clinic id); tests cover security audit surface elsewhere.
- **Outputs are decision-support only / clinician review required**:
  - DeepTwin router includes explicit decision-support caveats and role gates for clinical-review actors.
- **No “predicts outcomes” / “validated simulation” claim**:
  - “Predict” wording was softened in docs earlier (see AI compliance report). DeepTwin router text is framed as suggestions/hypotheses and explicitly requires clinician review.

## Issues fixed (real bug only)

- **Frontend unit test import**: `src/pages-mri-analysis.test.js` imported `renderMRILinkedModules` directly from the module, but the implementation is exposed under `mod._INTERNALS.renderMRILinkedModules`.  
  - Fix: adjust test to use `_INTERNALS.renderMRILinkedModules` so the test matches the module’s “test-only exports” contract.  
  - No product behavior changed.

## Remaining risks / constraints

- **Web build/e2e in this VM**: blocked by Node 18 (repo requires Node 20 for Vite 7). CI remains the gate for build and Playwright e2e.
- **Demo vs real MRI pipeline clarity**: current demo banner is explicit; consider periodically reviewing UI strings whenever pipeline adapters change to prevent accidental overclaim drift.

## Doctor-ready verdict

- **MRI Analyzer**: **Doctor-demo ready (demo mode)** — clear demo banner + offline sample report + export gating and safety footer present.
- **DeepTwin**: **Doctor-demo ready with supervision** — persistence, audit, cross-clinic gating, and decision-support wording present; simulation remains role-gated.

