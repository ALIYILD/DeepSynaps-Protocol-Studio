# DeepSynaps qEEG — function & module inventory (MNE / `deepsynaps_qeeg`)

Decision-support only. Clinician review required.

This document inventories **real qEEG processing** implemented in `packages/qeeg-pipeline/src/deepsynaps_qeeg/` and maps it to the Studio API and web UI.

It **does not** claim:

- native WinEEG compatibility
- proprietary WinEEG integration
- WinEEG parsers / WinEEG binaries
- “official” LORETA (DeepSynaps uses an **MNE-based eLORETA/sLORETA implementation**)

## Scope boundaries

### WinEEG-style workflow reference (reference-only)

- **Purpose**: manual qEEG review guidance, reference-only checklists, workflow concepts.
- **Not included**: any proprietary runtime, any WinEEG file ingestion, any WinEEG “engine”.
- **Implementation**: `deepsynaps_qeeg.knowledge.wineeg_reference` loads a JSON library of guidance and safety notes.

### DeepSynaps real processing (MNE / `deepsynaps_qeeg`)

- **Purpose**: load EEG files, preprocess, artifact handling, feature extraction, optional source localization, normative scoring, optional reporting.
- **Implementation**: Python modules in `packages/qeeg-pipeline/src/deepsynaps_qeeg/`.
- **Studio surfaces**: qEEG Analyzer, qEEG Raw Data Workbench, and supporting API endpoints.

## Summary table (capability → module → API/UI surface → status → caveat)


| Capability                                                                | Implementation module(s)                                                                            | API service / route                                                            | UI surface                                                       | Status                      | Caveat (decision-support only)                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| EEG file ingest (EDF/BDF/VHDR/SET/FIF) + montage + minimum validation     | `deepsynaps_qeeg.io`                                                                                | indirectly via pipeline; raw viewer uses MNE directly with fallback            | qEEG Analyzer upload + analysis; Raw Workbench load              | **Real**                    | Requires correct channel naming + montage mapping; fails below channel/sfreq/duration minimums |
| Preprocess: robust ref (PyPREP when available), bandpass, notch, resample | `deepsynaps_qeeg.preprocess`                                                                        | `apps/api/app/services/qeeg_pipeline.py` via `run_full_pipeline`               | qEEG Analyzer; Raw Workbench “cleaned signal” uses similar logic | **Real + fallback**         | PyPREP optional; fallback uses average ref + lightweight bad-channel detection                 |
| Artifact stage: ICA (ICLabel optional), epoching, autoreject (optional)   | `deepsynaps_qeeg.artifacts`                                                                         | `apps/api/app/services/qeeg_pipeline.py` via `run_full_pipeline`               | qEEG Analyzer; Raw Workbench has separate ICA review             | **Real + graceful-degrade** | ICLabel/autoreject optional; short/low-quality data reduces reliability                        |
| Spectral band power (absolute/relative), SpecParam aperiodic, PAF         | `deepsynaps_qeeg.features.spectral`                                                                 | pipeline → stored fields; also used by other services                          | qEEG Analyzer                                                    | **Real + partial**          | SpecParam optional; falls back to PAF-from-PSD when needed                                     |
| Connectivity matrices (wPLI, coherence)                                   | `deepsynaps_qeeg.features.connectivity`                                                             | pipeline → stored fields                                                       | qEEG Analyzer                                                    | **Real + fallback**         | `mne-connectivity` optional; returns zero matrices if missing                                  |
| Frontal Alpha Asymmetry (FAA)                                             | `deepsynaps_qeeg.features.asymmetry`                                                                | pipeline → stored fields                                                       | qEEG Analyzer                                                    | **Real**                    | Requires F3/F4 and/or F7/F8; propagates spectral confidence                                    |
| Graph metrics (clustering/path length/small-worldness)                    | `deepsynaps_qeeg.features.graph`                                                                    | pipeline → stored fields                                                       | qEEG Analyzer                                                    | **Real**                    | Requires `networkx`; disconnected graphs yield NaNs                                            |
| Source localization (template fsaverage) + DK ROI band power              | `deepsynaps_qeeg.source.`*                                                                          | pipeline optional + `qeeg-viz` payload endpoints                               | qEEG Analyzer (source panels / 3D viewer)                        | **Real + quality-guarded**  | Heavy; skipped when insufficient channels/epochs; model-derived, requires clinical correlation |
| Normative z-scores (toy CSV DB)                                           | `deepsynaps_qeeg.normative.zscore`                                                                  | pipeline → stored fields                                                       | qEEG Analyzer                                                    | **Real (toy norms)**        | Age/sex required; DB is toy fixture unless a real norm DB is configured                        |
| Normative centiles/z via GAMLSS (optional)                                | `deepsynaps_qeeg.normative.gamlss`                                                                  | qEEG Analyzer “AI upgrades” endpoints                                          | qEEG Analyzer                                                    | **Partial/optional**        | Depends on optional heavy libs; treat as experimental until validated norms                    |
| Reporting (HTML + PDF) + topomaps                                         | `deepsynaps_qeeg.report.generate`, `deepsynaps_qeeg.report.weasyprint_pdf`, `deepsynaps_qeeg.viz.`* | `qeeg-viz` report endpoints; pipeline `do_report=True`                         | qEEG Analyzer                                                    | **Real + graceful-degrade** | PDF requires WeasyPrint; images require matplotlib; always decision-support only               |
| Literature retrieval (RAG fallback supported)                             | `deepsynaps_qeeg.report.rag`                                                                        | via qEEG AI/report pipelines                                                   | qEEG Analyzer narrative/citations                                | **Real + fallback**         | DB-backed retrieval optional; JSON fixture fallback exists for offline/testing                 |
| Narrative generation safety wrapper                                       | `deepsynaps_qeeg.narrative.safety`                                                                  | called by report generator                                                     | qEEG Analyzer report                                             | **Real**                    | Must avoid diagnostic/treatment language; citations must be checked                            |
| Protocol recommendation (rules/ranker/library)                            | `deepsynaps_qeeg.recommender.`*                                                                     | `apps/api/app/routers/qeeg_analysis_router.py` recommendation endpoints        | qEEG Analyzer                                                    | **Real (backend-scaffold)** | Output is decision-support only; not a treatment recommendation                                |
| Live/streaming rolling features (LSL/mock)                                | `deepsynaps_qeeg.streaming.`*                                                                       | `apps/api/app/routers/qeeg_live_router.py`                                     | Live panel                                                       | **Real + optional**         | Feature-flagged + entitlement-gated; depends on SciPy; “Monitoring only — not diagnostic.”     |
| WinEEG-style workflow reference library + manual checklist                | `deepsynaps_qeeg.knowledge.wineeg_reference`                                                        | `GET /api/v1/qeeg-raw/{id}/reference-library`, `.../manual-analysis-checklist` | Raw Workbench                                                    | **Reference-only**          | No native WinEEG compatibility; guidance only                                                  |


## End-to-end orchestration (real processing)

### Primary pipeline entrypoint

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py`
- **Key public surface**
  - `PipelineResult` (dataclass)
  - `run_full_pipeline(eeg_path, age, sex, ..., user_overrides=...)`
- **What it does (high level)**
  - I/O: `io.load_raw`
  - Preprocess: `preprocess.run`
  - Artifact/epoching: `artifacts.run`
  - Features: `features.spectral.compute`, `features.connectivity.compute`, `features.asymmetry.compute`, `features.graph.compute`
  - Optional source localization: `source.forward`, `source.inverse`, `source.noise`, `source.roi`, `source.viz_3d`
  - Normative: `normative.zscore.compute`
  - Clinical summary (best effort): `clinical_summary.build_clinical_summary`
  - Optional longitudinal compare: `longitudinal.`*
  - Optional report: `report.generate.build`
- **Inputs**
  - EEG file path on disk
  - optional `age`, `sex`, `recording_state`, `medications`, and `user_overrides` (bad channels, annotations, ICA keep/exclude, filter overrides)
- **Outputs**
  - `PipelineResult.features` dict (contracted)
  - `PipelineResult.zscores` dict (contracted)
  - `PipelineResult.quality` dict (pipeline + stage errors)
  - optional `report_html`, `report_pdf_path`
- **Dependencies**
  - MNE is required to do real processing
  - Several stages have optional dependencies and fallbacks
- **Implementation status**
  - **Real** orchestration with defensive per-stage error capture
- **Clinical caveats**
  - Every stage is decision-support only; low-quality data leads to limited confidence; source localization is model-derived and requires clinical correlation.

### Studio API façade for the pipeline

- **File**: `apps/api/app/services/qeeg_pipeline.py`
- **Key public surface**
  - `HAS_MNE_PIPELINE`
  - `run_pipeline_safe(file_path, **kwargs) -> dict`
- **Behavior**
  - Never raises to callers; returns a structured error envelope when the optional pipeline stack is not installed.

## Module-by-module inventory (real processing + reference-only)

Below, “Used by Studio” means directly reachable via API/UI on this monorepo (not merely imported by another package module).

### I/O

#### `deepsynaps_qeeg.io`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/io.py`
- **Key items**
  - `EEGIngestError`
  - `detect_format(path)`
  - `load_raw(path, preload=True)`
- **Computes**
  - loads raw EEG via MNE readers; standardizes channel names; applies `standard_1020` montage; validates minimum sfreq/channels/duration.
- **Inputs/outputs**
  - input: file path
  - output: `mne.io.Raw` (validated & montaged)
- **Dependencies**
  - `mne`
- **Used by Studio**
  - via `deepsynaps_qeeg.pipeline.run_full_pipeline`
  - raw workbench may fall back to MNE direct load if pipeline I/O module is absent
- **Tests**
  - `packages/qeeg-pipeline/tests/test_io_malformed.py`
- **Status**
  - **Real**

### Preprocessing

#### `deepsynaps_qeeg.preprocess`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/preprocess.py`
- **Key functions**
  - `run(raw, bandpass, notch, resample)`
- **Computes**
  - robust average reference via PyPREP when available; otherwise average ref + lightweight noisy-channel detector; bandpass/notch/resample.
- **Inputs/outputs**
  - input: `mne.io.Raw`
  - output: `(cleaned_raw, quality_dict)`
- **Dependencies**
  - required: `mne`
  - optional: `pyprep`
- **Used by Studio**
  - pipeline; and analogous logic is used in `apps/api/app/services/eeg_signal_service.py` for “cleaned signal” view when pipeline preprocess is installed
- **Tests**
  - `packages/qeeg-pipeline/tests/test_preprocess.py`
  - `packages/qeeg-pipeline/tests/test_preprocess_fallback.py`
- **Status**
  - **Real + fallback**

### Artifact stage (ICA, epoching, autoreject)

#### `deepsynaps_qeeg.artifacts`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/artifacts.py`
- **Key functions**
  - `run(raw_clean, epoch_len, overlap, quality, ica_exclude_override, ica_keep_override)`
- **Computes**
  - ICA fit on high-pass copy; ICLabel labeling (optional) + auto-drop; epoching with overlap; autoreject (optional).
- **Dependencies**
  - required: `mne`
  - optional: `mne_icalabel`, `autoreject`
- **Used by Studio**
  - pipeline; raw workbench uses its own ICA handling for interactive review
- **Tests**
  - `packages/qeeg-pipeline/tests/test_artifacts.py`
- **Status**
  - **Real + graceful-degrade**

### Spectral features

#### `deepsynaps_qeeg.features.spectral`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py`
- **Key functions**
  - `compute(epochs, bands=FREQ_BANDS)`
- **Computes**
  - Welch PSD per channel; absolute + relative band power; SpecParam aperiodic fit (optional); peak alpha frequency (PAF).
  - Also outputs per-channel confidence metadata.
- **Dependencies**
  - required: `numpy`, `mne`
  - optional: `specparam`
  - fallback: SciPy welch if `epochs.compute_psd` is unavailable
- **Used by Studio**
  - pipeline; used indirectly in multiple AI/report paths
- **Tests**
  - `packages/qeeg-pipeline/tests/test_spectral.py`
- **Status**
  - **Real + partial (SpecParam optional)**

### Connectivity

#### `deepsynaps_qeeg.features.connectivity`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/connectivity.py`
- **Key functions**
  - `compute(epochs, bands=FREQ_BANDS)`
- **Computes**
  - per-band wPLI + coherence matrices; symmetrizes and zeros diagonal.
- **Dependencies**
  - required: `numpy`
  - optional: `mne-connectivity` (returns zero matrices when missing)
- **Used by Studio**
  - pipeline; also rendered by `qeeg-viz` endpoints
- **Tests**
  - `packages/qeeg-pipeline/tests/test_connectivity.py`
- **Status**
  - **Real + fallback**

### Asymmetry

#### `deepsynaps_qeeg.features.asymmetry`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/asymmetry.py`
- **Key functions**
  - `compute(features_spectral, ch_names)`
- **Computes**
  - FAA metrics (ln right − ln left) for F3/F4 and F7/F8.
  - Propagates spectral per-channel confidence.
- **Dependencies**
  - stdlib only
- **Used by Studio**
  - pipeline; rendered in Analyzer
- **Tests**
  - `packages/qeeg-pipeline/tests/test_asymmetry.py`
- **Status**
  - **Real**

### Graph metrics

#### `deepsynaps_qeeg.features.graph`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/graph.py`
- **Key functions**
  - `compute(connectivity)`
- **Computes**
  - clustering, characteristic path length, small-worldness on thresholded wPLI graphs.
- **Dependencies**
  - required: `numpy`
  - optional: `networkx` (returns empty if missing)
- **Used by Studio**
  - pipeline; rendered in Analyzer
- **Tests**
  - `packages/qeeg-pipeline/tests/test_graph.py`
- **Status**
  - **Real + dependency-optional**

### Source localization (MNE-based)

#### `deepsynaps_qeeg.source.forward`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/source/forward.py`
- **Key function**
  - `build_forward_model(raw, subject="fsaverage", subjects_dir=None, bids_subject=None)`
- **Dependencies**
  - `mne` (and fsaverage fetch)
- **Used by Studio**
  - pipeline source stage; tests
- **Status**
  - **Real**

#### `deepsynaps_qeeg.source.inverse`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/source/inverse.py`
- **Key functions**
  - `compute_inverse_operator(raw, forward, noise_cov)`
  - `apply_inverse(raw|epochs|evoked, inverse_operator, method="eLORETA"|...)`
- **Status**
  - **Real**

#### `deepsynaps_qeeg.source.noise`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/source/noise.py`
- **Key function**
  - `estimate_noise_covariance(epochs)`
- **Status**
  - **Real**

#### `deepsynaps_qeeg.source.roi`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/source/roi.py`
- **Key function**
  - `extract_roi_band_power(source_estimates, subject="fsaverage", subjects_dir=None) -> pandas.DataFrame`
- **Dependencies**
  - `mne`, `numpy`, `pandas`
- **Status**
  - **Real**

#### `deepsynaps_qeeg.source.viz_3d`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/source/viz_3d.py`
- **Key function**
  - `save_stc_snapshots(...)` (used to write report artifacts)
- **Status**
  - **Real**

**Tests**

- `packages/qeeg-pipeline/tests/test_source.py` (skips unless `mne`, `nibabel`, `pandas` installed)

### Normative scoring

#### `deepsynaps_qeeg.normative.zscore`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/normative/zscore.py`
- **Key items**
  - `ToyCsvNormDB` (fixture-backed)
  - `compute(features, age, sex, db=None, norm_db_version="toy-0.1")`
- **Status**
  - **Real (toy norms by default)**
- **Tests**
  - `packages/qeeg-pipeline/tests/test_normative.py`
  - `packages/qeeg-pipeline/tests/test_schema_v3.py` (output shape coverage)

#### `deepsynaps_qeeg.normative.gamlss`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/normative/gamlss.py`
- **Key items**
  - `GamlssNormativeDB`, `compute_centiles_and_zscores(...)`
- **Status**
  - **Optional/partial** (depends on heavy libs and dataset readiness)
- **Tests**
  - `packages/qeeg-pipeline/tests/test_gamlss_normative.py`

### Reporting + visualization helpers

#### `deepsynaps_qeeg.report.generate`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/generate.py`
- **Key function**
  - `build(result, out_dir, ch_names) -> (html_str, pdf_path|None)`
- **Status**
  - **Real + graceful-degrade** (no PDF if WeasyPrint missing)

#### `deepsynaps_qeeg.report.weasyprint_pdf`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/weasyprint_pdf.py`
- **Key function**
  - `build_pdf_report(result, ch_names, out_dir, case_id, recording_date, ...)`
- **Used by Studio**
  - `apps/api/app/routers/qeeg_viz_router.py` v2 PDF endpoint
- **Status**
  - **Real + dependency-optional**

#### `deepsynaps_qeeg.report.rag`

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/rag.py`
- **Key function**
  - `query_literature(conditions, modalities, top_k=...)`
- **Status**
  - **Real + fallback** (JSON fixture fallback when DB not configured)
- **Tests**
  - `packages/qeeg-pipeline/tests/test_rag.py`

#### `deepsynaps_qeeg.viz.`*

- **Files**
  - `viz/topomap.py`, `viz/band_grid.py`, `viz/connectivity.py`, `viz/source.py`, `viz/animation.py`, `viz/web_payload.py`
- **Purpose**
  - server-rendered images/payloads for browser viewers and the `qeeg-viz` router.
- **Used by Studio**
  - `apps/api/app/routers/qeeg_viz_router.py`
- **Status**
  - **Real + dependency-optional** (matplotlib/MNE required for rendering)
- **Tests**
  - `packages/qeeg-pipeline/tests/test_web_payload.py` (payload shape)

### Knowledge & reference-only guidance

#### `deepsynaps_qeeg.knowledge.wineeg_reference` (reference-only)

- **File**: `packages/qeeg-pipeline/src/deepsynaps_qeeg/knowledge/wineeg_reference.py`
- **Key functions**
  - `load_wineeg_reference_library()`
  - `manual_analysis_checklist()`
  - `format_wineeg_workflow_context()`
- **Used by Studio**
  - Raw Workbench endpoints (reference library + checklist)
  - Copilot prompt context: includes explicit safety wording (“WinEEG-style workflow reference only”)
- **Status**
  - **Reference-only**
- **Tests**
  - `packages/qeeg-pipeline/tests/test_knowledge.py` (validates reference-only + category coverage)

#### Other knowledge modules (clinical workflow concepts)

- **Files**
  - `knowledge/channel_anatomy.py`, `knowledge/medication_eeg.py`, `knowledge/artifact_atlas.py`, etc.
- **Purpose**
  - clinician-facing explanations, confound flagging, and context enrichment for findings.
- **Used by Studio**
  - Report generator and copilot/explanations
- **Status**
  - **Real (knowledge-base logic)**, but not a replacement for clinical judgment.

### Streaming (live qEEG monitoring)

#### `deepsynaps_qeeg.streaming.`*

- **Files**
  - `streaming/lsl_source.py`, `streaming/rolling.py`, `streaming/quality.py`, `streaming/zscore_live.py`, `streaming/server.py`
- **Used by Studio**
  - `apps/api/app/routers/qeeg_live_router.py` (SSE + WS)
  - `apps/web/src/components/QeegLive/LivePanel.tsx`
- **Status**
  - **Real + feature-flagged**
- **Tests**
  - `packages/qeeg-pipeline/tests/test_streaming.py`

### Recommender + AI adjuncts (decision-support)

#### `deepsynaps_qeeg.recommender.`*

- **Purpose**
  - rule/ranker-based protocol fit and candidate protocol selection.
- **Used by Studio**
  - endpoints in `apps/api/app/routers/qeeg_analysis_router.py` (optional import guard)
- **Status**
  - **Real (backend-scaffold)**; outputs must be framed as decision-support only.
- **Tests**
  - `packages/qeeg-pipeline/tests/test_recommender.py`
  - `packages/qeeg-pipeline/tests/test_protocol_recommender.py`

#### `deepsynaps_qeeg.ai.`*

- **Purpose**
  - risk scores, similar cases, explainability scaffolding, copilot tool dispatch, fusion synthesis.
- **Used by Studio**
  - qEEG Analyzer AI-upgrades endpoints + Copilot WS router.
- **Status**
  - **Mixed real/stub** depending on environment and availability of model weights / DB backends.
- **Tests**
  - `packages/qeeg-pipeline/tests/test_risk_scores.py`, `test_similar_cases.py`, `test_embeddings.py`, `test_copilot_backend.py`, etc.

## “Dead / unused” modules (interpretation guidance)

Simple string-based reference scanning can mistakenly label modules “unused” when they’re imported relatively (e.g. `from . import preprocess`) or used only via API routers that import submodules by function name.

**Actionable approach**:

- Treat modules as “potentially unused” only when:
  - they are not imported by `pipeline.py`, **and**
  - not imported by any Studio router/service (e.g. `qeeg_viz_router.py`, `qeeg_live_router.py`, `qeeg_analysis_router.py`), **and**
  - have no tests.

This repo already has a broad `packages/qeeg-pipeline/tests/` suite; most modules listed here are exercised directly or indirectly by tests.

## Test coverage notes (high-signal gaps)

- **Heavy optional stacks**: source localization, PDF rendering, and some AI/model paths are **skip-tested** (guarded by `pytest.importorskip`). That’s correct for CI portability but means failures can hide if the environment never installs those deps.
- **Studio integration tests**: the package tests validate algorithmic modules, but there is limited end-to-end coverage of:
  - “API persists pipeline outputs into DB columns” (migration compatibility)
  - “UI renders panels for every optional field”

## Recommended next engineering priorities (doctor-ready clarity)

1. **Make normative DB explicit**: document which deployments are still using `ToyCsvNormDB` vs real norms; surface norm DB metadata on every report.
2. **Add explicit dependency capability endpoint**: so UI can display “available/unavailable” for SpecParam/connectivity/source/PDF.
3. **Hardening around recording-state & medication confounds**: ensure every report includes the “decision-support only / clinician review required” framing plus confounds.
4. **Increase integration tests**: one API-level test that runs `analyze-mne` end-to-end with pipeline installed and checks DB columns + GET payload shape.

## Capability/dependency status endpoint (deployment transparency)

DeepSynaps also exposes a lightweight capability check endpoint:

- **API**: `GET /api/v1/qeeg/capabilities`
- **Purpose**: report **dependency/config availability only** (no heavy imports, no computation).
- **Statuses**: `active` / `fallback` / `unavailable` / `reference_only` / `experimental`
- **Safety**: decision-support only; clinician review required; **no secrets are returned**.