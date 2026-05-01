# MRI Analyzer integration review

**Scope:** `packages/mri-pipeline` — ingest, structural, registration, validation, QC, workflow orchestration, `pipeline.py`.

**How to use this doc:** Sections are **sorted by priority** (do P0 before P1). **Subagent prompts** at the end are copy-paste tasks for parallel Cursor agents (one agent per track).

---

## 1. Sorted priority queue (all findings)

| Priority | ID | Topic | Status | Notes |
|----------|-----|--------|--------|--------|
| P0 | R-01 | Resume with mismatched `PipelineNode` graph | **Fixed** | `execute_pipeline(..., resume=True)` now raises `ValueError`. |
| P0 | R-02 | `deface_t1` + `mri_deface` paths | **Fixed** | `FREESURFER_HOME` expanded; templates must exist. |
| P1 | R-03 | `dcm2niix` audit trail | **Fixed** | Optional `stderr_log_path`; success stderr logged at INFO. |
| P1 | R-04 | FastSurfer / SynthSeg failure visibility | **Fixed** | `_run_logged_subprocess` captures stderr. |
| P1 | R-05 | Provenance completeness | **Fixed** | `collect_provenance` includes `node_states`. |
| P1 | R-06 | Missing tests (io / structural / workflow) | **Fixed** | `test_io_convert.py`, `test_structural_subprocess.py`, resume guard test. |
| P2 | R-07 | Two orchestrators (`run_pipeline` vs workflow DAG) | **Documented** | Intentional; see §3 and subagent **Track D**. |
| P2 | R-08 | Weak types (`Transform.warped_moving: object`) | **Open** | Optional `typing.Protocol` or `TYPE_CHECKING` alias when worth it. |
| P2 | R-09 | `extract_structural_metrics` still TODO / placeholder ICV | **Open** | Blocks trustworthy morphometry in `run_pipeline`. |
| P2 | R-10 | Normative DB missing (`istaging.csv` etc.) | **Open** | Do not ship clinical z-claims until populated + validated. |

---

## 2. Readiness buckets (sorted: ship first → ship last)

### 2.1 Production-ready (with operational assumptions)

1. **Upload / NIfTI validation** — `validation.py`, `test_validation.py`.
2. **Workflow orchestrator** — `workflow_orchestration.py`, `test_workflow_orchestration.py`.
3. **DICOM → NIfTI** — `io.py`; use `stderr_log_path` when you need a saved `dcm2niix` trace.
4. **ANTs registration helpers** — `registration.py`; enforce **MNI152NLin2009cAsym** consistently in ops.

### 2.2 Adapter-only (wrap external CLIs / libs)

1. **Structural** — `run_fastsurfer`, `run_synthseg` (`structural.py`).
2. **Registration** — antspyx (`registration.py`).
3. **QC** — `mriqc` wrapper (`qc.py`).
4. **Ingest** — `dcm2niix` / `dicom2nifti` / `pydicom` (`io.py`).

### 2.3 External tool dependencies (deployment checklist)

| Layer | Depends on |
|--------|------------|
| Ingest | `dcm2niix` (preferred) or `dicom2nifti` |
| Structural | FastSurfer script or Docker; `mri_synthseg` |
| Registration | `antspyx` + template discipline |
| Defacing | `pydeface` or `mri_deface` + `FREESURFER_HOME` layout |
| Optional QC | `mriqc` |

### 2.4 Validate next on real MRI data (ordered)

1. **Ingest** — multi-series / enhanced DICOM; fallback vs `dcm2niix` sidecars.
2. **Registration** — poor T1, pediatric templates, inverse warp for targets.
3. **Segmentation** — GPU/CPU paths, disk, clinical T1 heterogeneity.
4. **Defacing** — container `FREESURFER_HOME`, sharing-ready output.
5. **E2E `run_pipeline`** — after **R-09** is implemented, not before.

### 2.5 Do not ship yet

1. **Clinical / normative z-score claims** without real normative data + validation (**R-10**).
2. **Automated stim dosing** — planning aids only; clinician review required.
3. **DAG replacing `run_pipeline`** without golden-container or real-tool CI (**Track D**).

---

## 3. Orchestration split (for agents)

- **`run_pipeline`** (`pipeline.py`): monolithic clinical stages (`STAGES` union). Use for the current product path until modular DAG is proven E2E.
- **`execute_pipeline`** (`workflow_orchestration.py`): restartable DAG, per-node state, provenance JSON. Use for worker jobs and **new** modular MRI chains.

---

## 4. Subagent tracks (parallel prompts)

Use **one agent per track**. Each prompt is self-contained; agents should work in a **git worktree** or separate branch to avoid clobbering (`AGENTS.md` concurrent-session note).

### Track A — Types and static clarity (P2, **R-08**)

**Goal:** Improve typing around ANTs image handles without pulling antspyx into runtime imports for all consumers.

**Likely files:** `registration.py`, maybe `pyproject.toml` / `typing` stubs.

**Acceptance:** mypy/pyright (if configured) or at least consistent `TYPE_CHECKING` blocks; no behaviour change.

**Prompt (copy):**

> In `packages/mri-pipeline`, improve type hints for `registration.Transform` and any public functions that return antspyx images. Use `typing.TYPE_CHECKING` and forward references or a small `Protocol` so `warped_moving` is not bare `object`. Do not change runtime behaviour or public call signatures unless necessary; run pytest.

---

### Track B — Structural metrics completion (P2, **R-09**)

**Goal:** Implement `extract_structural_metrics` to parse FastSurfer vs SynthSeg outputs (aseg.stats / volumes.csv / aparc) and populate `StructuralMetrics` with real ICV and region stats where possible.

**Likely files:** `structural.py`, `schemas.py`, `tests/test_structural*.py` (new or extended).

**Acceptance:** unit tests with fixture files or minimal synthetic stats; no UI; no new deps without justification.

**Prompt (copy):**

> Implement `extract_structural_metrics` in `packages/mri-pipeline/src/deepsynaps_mri/structural.py`: parse FastSurfer-style `aseg.stats` and `lh.aparc.stats`/`rh.aparc.stats` when present; parse SynthSeg `volumes.csv` when that is the engine. Populate `StructuralMetrics` (ICV, regional volumes, thickness summaries where available). Add pytest with small fixture text files. Follow existing schema patterns; do not add normative z-scores until data exists — leave TODO or explicit `None` for normative fields.

---

### Track C — Golden / integration path (P1–P2)

**Goal:** One documented way to run `run_pipeline` or a minimal ingest→register→structural chain in CI or a **single** reference container, with exit codes and artefact layout checks.

**Likely files:** `demo/`, `docs/MRI_ANALYZER.md` or new `docs/MRI_E2E.md`, optional GitHub Action **if** repo already uses actions.

**Acceptance:** documented command(s); optional skipped-by-default pytest if no tools in CI.

**Prompt (copy):**

> Add a minimal E2E or “golden smoke” path for `packages/mri-pipeline`: document exact host/container prerequisites, one command to run a tiny pipeline or dry-run checklist, and expected artefact directories. If adding CI, gate it behind a label or manual workflow so missing FSL/FreeSurfer does not break default PR checks. Do not require large data downloads in CI.

---

### Track D — Orchestration documentation only (P2, **R-07**)

**Goal:** Single source of truth for when to use `run_pipeline` vs `workflow_orchestration`, and how they might converge later.

**Likely files:** `docs/WORKFLOW_ORCHESTRATION.md`, `docs/MRI_ANALYZER.md` (short cross-links only).

**Acceptance:** no code changes required; links from package README if one exists.

**Prompt (copy):**

> Update `packages/mri-pipeline` docs only: add a short “Choosing an orchestrator” section linking `pipeline.run_pipeline` and `workflow_orchestration.execute_pipeline`, with bullet rules for product vs worker use. No API changes.

---

### Track E — Normative data policy (P2, **R-10**)

**Goal:** Make “no z-scores until licensed/populated data” explicit in code paths or schema docs so agents do not invent numbers.

**Likely files:** `structural.py` docstrings, `schemas.py` field descriptions, `INTEGRATION_REVIEW_MRI.md` (this file).

**Acceptance:** clear `None`/status enums for normative fields; no fake CSV committed as “real norms”.

**Prompt (copy):**

> Audit `StructuralMetrics` and related schema fields for normative/z-score claims. Ensure placeholders are explicit (`None`, `status=not_available`) and document in `structural.py` or schema docstrings that `data/norms/istaging.csv` must be supplied under license before clinical use. No speculative normative values in code.

---

## 5. Recommended execution order for humans

1. **Ship / monitor** fixes already merged (**R-01–R-06**).
2. **Track B** (structural metrics) — unblocks honest E2E reports.
3. **Track C** (golden smoke) — proves deployments.
4. **Track A, D, E** in parallel as hygiene and compliance.

---

*Last updated: integration review prioritization + subagent split.*
