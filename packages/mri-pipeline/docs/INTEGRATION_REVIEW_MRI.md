# MRI Analyzer integration review (2026-05-01)

Scope: `packages/mri-pipeline` — structural MRI path, ingest, registration, workflow orchestration, and related tests on the branch that adds `workflow_orchestration`.

## Findings (before fixes in this review)

| Area | Issue | Severity |
|------|--------|----------|
| **API / behaviour** | `execute_pipeline(..., resume=True)` silently started a **new** run when persisted nodes did not match the passed-in graph, leaving old `workflow/` state on disk — risky for crossed jobs. | High |
| **Provenance** | `collect_provenance` listed artifacts and node definitions but not per-node **attempts**, **errors**, or **timestamps**. | Medium |
| **Subprocess** | `convert_dicom_to_nifti` discarded `dcm2niix` stdout/stderr on success (warnings invisible); on failure stderr was only logged, not optionally persisted. | Medium |
| **Runtime** | `deface_t1` passed literal `$FREESURFER_HOME/...` paths with `shell=False`, so `mri_deface` would not resolve templates. | High |
| **Subprocess** | FastSurfer / SynthSeg failures returned little context (`check=True` with no captured output). | Medium |
| **Duplication** | Two orchestration concepts: `pipeline.run_pipeline` (stage string union) vs `workflow_orchestration` (DAG). Intentional split; document which to use when. | Low |
| **Types** | `registration.Transform.warped_moving` typed as `object` (ANTs image handle). Acceptable for antspyx but weak for static analysis. | Low |
| **Tests** | No unit tests for `io.convert_dicom_to_nifti` subprocess boundary or `deface_t1` path handling. | Medium |

## Changes made in this review (scoped)

1. **`workflow_orchestration`**: resume with mismatched nodes raises `ValueError`; `collect_provenance` includes `node_states` summary.
2. **`io.convert_dicom_to_nifti`**: optional `stderr_log_path` on `dcm2niix` failure; log non-empty stderr on success.
3. **`structural`**: `_run_logged_subprocess` for FastSurfer/SynthSeg; `deface_t1` resolves `FREESURFER_HOME` and checks template files.
4. **Tests**: `test_io_convert.py`, `test_structural_subprocess.py`; extended workflow provenance / resume mismatch tests.
5. **Docs**: `WORKFLOW_ORCHESTRATION.md` updated for resume semantics and provenance shape.

---

## What is production ready

- **Upload / header validation** (`validation.py`) — exercised by `test_validation.py`.
- **Workflow orchestrator** — deterministic ordering, retries, resume, provenance file, failure isolation; covered by `test_workflow_orchestration.py`.
- **DICOM→NIfTI path** — logic is sound; `dcm2niix` boundary is now more auditable when optional log path is used.
- **ANTs registration helpers** (`register_t1_to_mni`, warps) — thin, standard antspyx usage; production use still requires correct template space discipline (MNI152NLin2009cAsym).

## What is still adapter-only / thin wrappers

- **Structural segmentation** (`run_fastsurfer`, `run_synthseg`) — subprocess wrappers only; no in-repo algorithm.
- **Registration** — antspyx calls only.
- **QC** (`qc.py` mriqc) — CLI wrapper.
- **Ingest** — `dcm2niix` / `dicom2nifti` / `pydicom` de-id.

## What still depends on external tools

| Component | External dependency |
|-----------|---------------------|
| Ingest | `dcm2niix` (preferred) or `dicom2nifti` |
| Structural | FastSurfer script or Docker image; `mri_synthseg` (FreeSurfer) |
| Registration | `antspyx` (+ bundled MNI template) |
| Defacing | `pydeface` or FreeSurfer `mri_deface` + `FREESURFER_HOME` layout |
| Optional QC | `mriqc` CLI |

## What to validate next on real MRI data

1. **Ingest**: multi-series DICOM, enhanced DICOM, missing slice tolerance; BIDS sidecar richness vs `dicom2nifti` fallback.
2. **Registration**: T1 quality (motion, bias), pediatric vs adult templates, re-test warp inverse for stim targets.
3. **Segmentation**: engine fallback order (CUDA + FastSurfer vs SynthSeg) on clinical-grade T1s; disk and GPU limits.
4. **Defacing**: verify output is acceptable for sharing; confirm `FREESURFER_HOME` deployment in containers.
5. **End-to-end** `run_pipeline`: only after structural metrics parsing TODOs are implemented — `extract_structural_metrics` still returns placeholder ICV.

## What should not be shipped yet

- **Clinical claims on morphometry / z-scores** until normative DB (`data/norms/istaging.csv` per `structural.py` docstring) is populated and validated.
- **Automated stim delivery parameters** — repo rules require clinician review; targeting outputs are planning aids only.
- **Full “modular DAG” replacing `run_pipeline`** without integration tests that run real tools in CI or a golden container.

---

*Agents: prefer `workflow_orchestration` for restartable worker jobs; keep `run_pipeline` for the monolithic clinical path until modular stages are wired and tested end-to-end.*
