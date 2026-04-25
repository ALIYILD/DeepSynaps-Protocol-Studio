# Longitudinal qEEG (within-patient change)

This module adds **within-patient longitudinal change** to the qEEG pipeline and report. It is intended for *research / wellness decision support* and should not be interpreted as diagnostic output.

## What it does

- **Loads** prior session artifacts from disk (default convention):
  - `outputs/<patient_id>/<session_id>/features.json`
  - optionally also `zscores.json` and `quality.json` (if present)
- **Compares** `curr` vs `prev` and computes:
  - **Per-band, per-channel** deltas for spectral power:
    - absolute power delta and relative change
    - **z-score deltas** (when zscores exist)
  - **Connectivity deltas** (summary per band/method):
    - mean absolute edge delta
    - Frobenius norm delta
  - **IAPF shift**: mean peak-alpha-frequency shift (Hz)
  - **TBR delta**: theta/beta ratio change (mean absolute band power)
- **Flags change** via **Reliable Change Index (RCI)** for key metrics using bundled variance estimates (conservative placeholders until a full norms package is integrated).
- **Visualizes**:
  - change topomaps (Δz) using **`RdBu_r`** with a fixed **±2 z** scale
  - trend plots when **≥3 sessions** exist on disk for the patient

## Where code lives

- Core package: `packages/qeeg-pipeline/src/deepsynaps_qeeg/longitudinal/`
  - `store.py`: `SessionStore` + `FileSessionStore`
  - `compare.py`: `compare_sessions(curr, prev) -> ComparisonResult`
  - `significance.py`: `rci_for_comparison(...)`
  - `viz.py`: `plot_change_topomap(...)`, `plot_trend_lines(...)`
- Pipeline wiring (optional): `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py`
- Report integration: `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/generate.py`
- Tests: `packages/qeeg-pipeline/tests/test_longitudinal.py`

## Pipeline usage

`run_full_pipeline(..., prev_session_id=..., recording_state=...)` will attempt a longitudinal comparison if:

- `prev_session_id` is provided
- `out_dir` is provided and follows the session output convention
- previous session artifacts exist on disk

### Safety guards

- **Montage mismatch**: comparison is refused if channel ordering differs between sessions.
- **State mismatch**: comparison is refused if `quality["recording_state"]` differs (e.g. eyes-open vs eyes-closed).

In both cases, the pipeline continues and records the reason under `quality["stage_errors"]["longitudinal"]`.

