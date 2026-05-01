# MRI Analyzer — 12-prompt audit (workspace truth)

This table maps the **twelve Cursor prompts** from the MRI Analyzer build session to **what exists in this repository today**. Use it to see what is merged vs still only on other branches or unmerged.

**Verification run (this workspace):**

- `cd packages/mri-pipeline && python3 -m pytest -q` → **112 passed**, **1 skipped** (re-run after changes)
- `cd apps/web && node --test src/pages-mri-analysis.test.js` → **33 passed** (when Node is available)

**Note:** Update the pytest count whenever modules/tests change; the checklist below reflects **current** `src/deepsynaps_mri/` layout.

---

## Prompt checklist

| # | Prompt / deliverable | Expected artefacts | Status in **this** workspace | Evidence / gap |
|---|----------------------|-------------------|---------------------------|----------------|
| 1 | **Architecture plan** (stacks, roadmap, tickets) | Markdown output (often chat-only) | **N/A in repo** | No `MRI_ARCHITECTURE_PLAN.md` checked in; treat as conversation deliverable. |
| 2 | **AGENTS.md** (root agent rules) | `/AGENTS.md` | **Present** | Root `AGENTS.md`. Subprocess boundaries are centralized under `deepsynaps_mri/adapters/` (`dcm2niix`, `fastsurfer`, `synthseg`, `deface`, FSL BET/FAST/FIRST, shared helpers); legacy direct calls may remain in `io.py` / `structural.py` / `qc.py` until migrated. |
| 3 | **Implementation tickets** | GitHub issues / markdown | **Not in repo** | No `MRI_TICKETS.md` file; create or paste into issue tracker. |
| 4 | **Ingestion module** (`import_dicom_series`, `validate_mri_input`, …) | `ingestion.py`, tests | **Present** | `ingestion.py` (`import_dicom_series`, `convert_to_nifti`, `validate_mri_input`, …). `test_ingestion.py`. |
| 5 | **Preprocessing module** (BET, N4, QC, …) | `preprocessing.py`, adapters, tests | **Present** | `preprocessing.py`; FSL BET via `adapters/fsl_bet.py`; N4/orientation/intensity helpers. |
| 6 | **Registration module** (extended: `register_to_mni`, bundles, QC) | `registration.py` + tests | **Present** | Core ANTs API + `persist_registration_to_mni` / `register_to_mni`, `apply_transform`, `invert_transform`, `compute_registration_qc`. `test_registration.py`. |
| 7 | **Segmentation module** (FAST/FIRST, standard labels) | `segmentation.py`, adapters, tests | **Present** | `segmentation.py`; `adapters/fsl_fast.py`, `adapters/fsl_first.py`. |
| 8 | **Cortical surfaces module** | `cortical_surfaces.py`, FastSurfer adapter, tests | **Present** | `cortical_surfaces.py` + `test_cortical_surfaces_thickness.py`; FastSurfer still via `structural` / `adapters/fastsurfer.py`. |
| 9 | **Cortical thickness module** | `cortical_thickness.py`, tests | **Present** | `cortical_thickness.py`; shares parsers with `structural_stats.py`. |
| 10 | **Morphometry / reporting module** | `morphometry_reporting.py`, payload schemas, tests | **Present** | `morphometry_reporting.py`; `MRIAnalysisReportPayload` et al. in `schemas.py`. Demo optional morphometry path works when module present. |
| 11 | **Workflow orchestration** | `workflow_orchestration.py`, tests, docs | **Present** | `workflow_orchestration.py`, `test_workflow_orchestration.py`, `WORKFLOW_ORCHESTRATION.md`, `demo/workflow_mri_example.py`. |
| 12 | **Integration review** | Summary + fixes | **Present** | `INTEGRATION_REVIEW_MRI.md` (+ hardening in `io.py`, `structural.py`, workflow). |

---

## Web / MRI page prompts (same session, separate thread)

| Item | Expected | Status in **this** workspace |
|------|----------|------------------------------|
| Demo banner, jump nav, collapsible sections, empty states | `pages-mri-analysis.js`, `styles.css`, tests | **Not found** — current `pages-mri-analysis.js` has no `ds-mri-demo-banner` / `renderMRIReportSectionsNav` strings; tests still pass on existing behaviour. |
| Vite `server.open` | `vite.config.ts` | **Not set** — `server` has `port` + `proxy` only. |
| `.vscode` tasks / Live Preview | `.vscode/tasks.json` | **No `.vscode/`** in workspace. |

---

## Conclusion

- **Fully applied in this checkout:** modular layers **4–10** (ingestion, preprocessing, extended registration, segmentation, cortical surfaces, cortical thickness, morphometry reporting), workflow orchestration (11), integration-review docs (12), root **AGENTS.md** (2), adapters package, and the **shipping** path `pipeline.run_pipeline()` plus stage manifests.
- **Still optional / out of scope for Python prompts:** prompt **1** (architecture plan as checked-in doc), **3** (ticket markdown in repo), **Web UX** row (demo banner, jump nav, Vite `server.open`, `.vscode` tasks) — implement in `apps/web` / tooling when prioritized.
- **Working:** full `pytest` suite in `packages/mri-pipeline`; `workflow_mri_example.py` imports morphometry when available.

**Suggested next steps:** (1) Merge MRI modular branch to `main` if not already. (2) Optional web UX pass on `pages-mri-analysis.js`. (3) Optionally route `pipeline.run_pipeline` through the `ingestion` façade for a single public import surface (today `io.ingest` remains the internal entry).
