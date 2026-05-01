# MRI Analyzer — 12-prompt audit (workspace truth)

This table maps the **twelve Cursor prompts** from the MRI Analyzer build session to **what exists in this repository today**. Use it to see what is merged vs still only on other branches or unmerged.

**Verification run (this workspace):**

- `cd packages/mri-pipeline && python3 -m pytest -q` → **91 passed**, **1 skipped**
- `cd apps/web && node --test src/pages-mri-analysis.test.js` → **33 passed** (when Node is available)

---

## Prompt checklist

| # | Prompt / deliverable | Expected artefacts | Status in **this** workspace | Evidence / gap |
|---|----------------------|-------------------|---------------------------|----------------|
| 1 | **Architecture plan** (stacks, roadmap, tickets) | Markdown output (often chat-only) | **N/A in repo** | No `MRI_ARCHITECTURE_PLAN.md` checked in; treat as conversation deliverable. |
| 2 | **AGENTS.md** (root agent rules) | `/AGENTS.md` | **Present** (was untracked; commit with this audit) | Root `AGENTS.md` — note: `deepsynaps_mri/adapters/` is aspirational; today subprocess calls live in `io.py`, `structural.py`, `qc.py`. |
| 3 | **Implementation tickets** | GitHub issues / markdown | **Not in repo** | No `MRI_TICKETS.md` file; create or paste into issue tracker. |
| 4 | **Ingestion module** (`import_dicom_series`, `validate_mri_input`, …) | `ingestion.py`, `test_ingestion.py`, `INGESTION.md` | **Not present** | **Partial overlap:** `io.py` has `deidentify_dicom_dir`, `convert_dicom_to_nifti`, `ingest`; `validation.py` has `validate_nifti_header` / `validate_upload_blob`. No `import_dicom_series` symbol. |
| 5 | **Preprocessing module** (BET, N4, QC, …) | `preprocessing.py`, adapters, tests | **Not present** | No `preprocessing.py`, no `adapters/` package under `deepsynaps_mri/`. |
| 6 | **Registration module** (extended: `register_to_mni`, bundles, QC) | `registration.py` + tests | **Partial** | `registration.py` has **`register_t1_to_mni`**, `warp_image_to_mni`, `warp_points_to_patient` only. No `register_to_mni`, `apply_transform` file bundle API, `compute_registration_qc`. No `test_registration.py`. |
| 7 | **Segmentation module** (FAST/FIRST, standard labels) | `segmentation.py`, adapters, tests | **Not present** | **Partial overlap:** `structural.py` runs FastSurfer / SynthSeg; no separate `segmentation.py` or FSL FAST/FIRST adapters in-tree. |
| 8 | **Cortical surfaces module** | `cortical_surfaces.py`, FastSurfer adapter, tests | **Not present** | Surfaces implied via FastSurfer paths in `structural.py` only. |
| 9 | **Cortical thickness module** | `cortical_thickness.py`, tests | **Not present** | Thickness mentioned in schemas/pipeline; no dedicated module file. |
| 10 | **Morphometry / reporting module** | `morphometry_reporting.py`, payload schemas, tests | **Not present** | `demo/workflow_mri_example.py` **imports** `morphometry_reporting` optionally → **ImportError** path writes stub (works, but module missing). |
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

- **Fully applied in this checkout:** workflow orchestration (prompt 11), integration-review hardening (prompt 12), root **AGENTS.md** (prompt 2), core legacy pipeline pieces (`io`, `structural`, `registration` thin API, `validation`, `pipeline`).
- **Not applied / missing files:** dedicated modules from prompts **4–10** (ingestion layer as specified, preprocessing, extended registration, segmentation, surfaces, thickness, morphometry_reporting), ticket markdown (3), architecture doc (1), and the **MRI page UX** enhancements listed above.
- **Working:** pytest and MRI page unit tests pass; `workflow_mri_example.py` runs with optional morphometry step stubbed when the module is absent.

**Next step to “complete” the 12 prompts:** merge or port the feature branches that add `ingestion.py`, `preprocessing.py`, extended `registration.py`, `segmentation.py`, `cortical_surfaces.py`, `cortical_thickness.py`, `morphometry_reporting.py`, and web UX — or implement them on `main` following `INTEGRATION_REVIEW_MRI.md` subagent tracks.
