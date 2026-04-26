# Upgrades Applied

## qEEG Analyzer

- Added `packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py`.
  - Produces a structured clinical-review block with patient context, data-quality flags, confidence score, observed findings, derived interpretations, limitations, review items, method provenance, and safety statement.
  - Separates observed signal features from model-derived interpretation.
- Wired qEEG summaries into `run_full_pipeline`.
  - Stores the block at `features["clinical_summary"]` so API/report consumers can reuse it.
- Upgraded qEEG HTML report rendering.
  - Adds a clinician-readable summary section before plots and a machine-readable JSON block for downstream reuse.

## MRI Analyzer

- Added `packages/mri-pipeline/src/deepsynaps_mri/clinical_summary.py`.
  - Summarizes QC, MRIQC/incidental status, flagged regions, fMRI markers, diffusion findings, targeting limitations, confidence, and next review items.
- Extended `MRIReport` with `clinical_summary`.
- Wired MRI summaries into the end-to-end MRI pipeline.
- Upgraded MRI report rendering.
  - Adds clinical review summary, QC warnings, observed region/network findings, model-derived planning notes, limitations, and a JSON payload block.

## Risk scores

- Enhanced qEEG similarity-index output in `risk_scores.py`.
  - Adds `top_contributors`, `calibration`, and `evidence_links`.
  - Keeps labels as `*_like` and preserves the non-diagnostic disclaimer.
  - Makes rule-derived contributors visible for clinician audit.

## Multimodal fusion

- Enhanced `deepsynaps_qeeg.ai.fusion`.
  - Adds `modality_agreement`, `missing_modalities`, `limitations`, `evidence_summary`, and `provenance`.
  - Rewords action language toward review/planning rather than directive recommendations.
- Extended API response model in `fusion_router.py` to expose the new structured fields.

## Digital Twin / prediction engine

- Added simulation provenance to `simulate_intervention_scenario`.
  - Includes assumptions, uncertainty method, counterfactual basis, feature attribution method, generated timestamp, and model identifier.
  - Supports auditability without overstating deterministic demo simulation outputs.

## Required deliverables

- Added `benchmark_report.md`.
- Added `module_scorecard.json`.
- Added `tests_added.md`.
- This file documents code changes and rationale.
