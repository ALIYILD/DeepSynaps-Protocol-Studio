# MRI Stream — Current State Audit

**Date:** 2026-04-26 (Night Shift, Stream 2)
**Auditor:** MRI Specialist agent
**Scope:** packages/mri-pipeline/, apps/api/app/routers/mri_analysis_router.py,
apps/api/app/services/mri_pipeline.py, apps/web/src/pages-mri-analysis*.js

---

## 1. Upload validation
- Router: `apps/api/app/routers/mri_analysis_router.py:482` `upload_mri`.
  - Auth: `clinician`+ role enforced; cross-clinic ownership gate via
    `_gate_patient_access` (line 60).
  - Size: capped at 500 MB (`_MAX_UPLOAD_BYTES`, line 82).
  - Empty file → 422 `file_empty`. Oversize → 422 `file_too_large`.
  - **Gap:** no MIME / extension whitelist (`.nii`, `.nii.gz`, `.zip` only).
    Anything `.bin`, `.exe`, `.dcm` raw, even arbitrary text, is accepted.
  - **Gap:** no NIfTI magic-byte check before persisting.
  - **Gap:** no DICOM zip sanity (e.g. ZipFile.testzip()).
- Pipeline `io.py` (`packages/mri-pipeline/src/deepsynaps_mri/io.py:82`):
  - DICOM de-identification: blanket tag blacklist + dcm2niix preferred,
    `dicom2nifti` Python fallback.
  - **Gap:** caller never calls `ingest()` directly from the API surface
    today — staging is async / out-of-band. Validation is loose.

## 2. Supported formats
- `.nii`, `.nii.gz`, `.zip` (DICOM bundle). Implicit only.
- DICOM single-file uploads (.dcm) are NOT explicitly handled, would land on
  disk and break later.
- BIDS sidecar JSON parsed in `_collect_outputs` — best-effort.

## 3. NIfTI handling
- `nibabel` used in `io._collect_outputs` and `models/brain_age.py` for
  load + voxel size + zooms.
- Header parse: `img.header.get_zooms()[:3]` only; **no** sform/qform check,
  no datatype sanity, no orientation check, no shape sanity.
- `_load_t1_tensor` (brain_age.py:293) does z-score normalisation but accepts
  any input shape — no shape / dim check.
- **Gap:** no canonical "validate_nifti" helper exposed despite README claim
  (`from deepsynaps_mri import validate_nifti` does not exist; only schemas
  exported from `__init__.py:7`).

## 4. Preprocessing readiness
- Skull strip: not explicitly implemented; SynthSeg / FastSurfer handles it
  internally during segmentation (structural.py:222 `segment`).
- Bias correction: not explicit. ANTs N4 bias correction would belong in
  `registration.py`.
- Registration: `register_t1_to_mni` referenced from pipeline.py:163 but
  `registration.py` only has 114 lines and the actual function is a stub.
- Defacing: `deface_t1()` (structural.py:265) — pydeface / mri_deface paths.

## 5. Viewer integration
- NiiVue. Frontend mounts NiiVue dynamically (`apps/web/src/mri-viewer-cs3d.js`
  + viewer payload at `pages-mri-analysis.js`).
- API endpoint `GET /api/v1/mri/{analysis_id}/viewer.json`
  (mri_analysis_router.py:773) builds a viewer payload via
  `niivue_payload.build_payload`.
- Overlays + DTI bundles + targets are all wired.

## 6. Region / ROI outputs
- Schema `StructuralMetrics.cortical_thickness_mm: dict[str, NormedValue]`
  + `subcortical_volume_mm3: dict[str, NormedValue]` (schemas.py:167).
- `NormedValue` carries value, unit, z, percentile, flagged.
- **Gap:** no explicit `confidence`, `reference_range`, no per-region
  provenance / model id, no ICV-correction flag.
- `extract_structural_metrics` (structural.py:234) is a TODO stub —
  returns an empty `StructuralMetrics`. The pipeline never actually
  populates regional values; the demo report is hard-coded.

## 7. Volumetrics
- Cortical thickness keyed by Desikan-Killiany.
- Subcortical volumes (hippocampus, amygdala) keyed.
- WMH volume: `wmh_volume_ml` field present but only LST-AI populates it.
- Ventricular volume present in schema.
- **Gap:** all extraction is stubbed — pipeline returns demo data only.

## 8. Longitudinal comparisons
- `longitudinal.py` (440 lines) computes per-region delta_pct + flags,
  optional ANTs SyN Jacobian map.
- Endpoint `/api/v1/mri/compare/{baseline_id}/{followup_id}`
  (mri_analysis_router.py:965) — solid, well-tested.
- Frontend test: `pages-mri-analysis-compare.test.js`.

## 9. Brain-age model
- `models/brain_age.py` predicts predicted_age_years + cognition_cdr_estimate.
- Status envelope (ok / dependency_missing / failed). **Good** graceful
  degradation.
- **Gap:** no plausibility range check on predicted age (could return
  negative or > 200 if model misbehaves).
- **Gap:** gap z-score uses ad-hoc MAE-as-SD divisor — not calibrated.
- **Gap:** no confidence band returned despite reference MAE — caller can't
  reason about uncertainty.
- **Gap:** no calibration provenance in the output (training cohort,
  age range trained on).

## 10. Report fields
- `MRIReport` (schemas.py:299) has 13 top-level fields including
  `qc_warnings`, `clinical_summary`. Solid.
- `_report_from_row` (router line 319) injects `_DISCLAIMER` always.
- **Gap:** no explicit `findings` array using safe language; targets &
  metrics are presented but no semantic separation between
  "observation/finding/requires_correlation".

## 11. QC, confidence, explainability
- `QCMetrics` (schemas.py:102) carries MRIQC + incidental envelope.
- `IncidentalFinding.confidence: float` only on the incidental side.
- `StimTarget.confidence: Literal["low","medium","high"]` only.
- `BrainAgePrediction` has no per-region attribution / explainability hook.
- Frontend QC banner already implemented (pages-mri-analysis.js:1815
  `renderQCWarningsBanner`).

## 12. Multimodal fusion readiness
- `MedRAGQuery` (schemas.py:291) is structured (findings + conditions) and
  consumed by the MedRAG bridge. **OK fusion-ready for retrieval.**
- **Gap:** there is no canonical "fusion payload" schema
  (`{subject_id, modality:"mri", findings[], qc, provenance}`) for the
  qEEG-MRI fusion router to consume. Fusion has to walk the full MRIReport.
- The fusion endpoint is OFF-LIMITS to this stream; we add a producer-side
  helper in mri-pipeline that fusion can later consume.

## 13. API output shape
- `_report_from_row` always returns the same dict shape (router 319). Good.
- 503 envelope on PDF unavailable. Good.
- Demo-mode short circuit covered by `MRI_DEMO_MODE=1`.
- **Gap:** when sync mode fails, the qc_json gets a one-line `notes`
  but no structured failure code.

## 14. UI rendering
- `pages-mri-analysis.js` (2901 lines) — heavy page: viewer, brain-age,
  QC banner, stim targets, comparison flow.
- Has loading / error states (search results 1299, 1319, 2298, 2557).
- Has confidence rendering (line 1371-1372, 1418).
- **Gap:** no QC summary chip strip in main scan summary header — the
  banner only shows when warnings exist.
- **Gap:** brain-age card already guards against impossible predicted age
  (lines 1702-1707) — good defensive UI.

## 15. Tests baseline (run 2026-04-26 night)
- `pytest packages/mri-pipeline/tests/ -v` → **30 passed**.
- `pytest apps/api/tests/test_mri_analysis_router.py -v` → **17 passed**.
- Web tests not run during this audit pass; tests exist:
  `pages-mri-analysis*.test.js` (4 files, 470 + 158 + 175 + 136 lines).

---

## Summary
The MRI pipeline package is well-structured (graceful degradation on every
optional dependency, canonical schemas, demo-mode short-circuit, working
longitudinal comparison). The biggest gaps are (1) lax NIfTI/upload
validation, (2) no plausibility / calibration safety on the brain-age
output, (3) ROI extraction is stubbed (demo-data driven), and (4) no
explicit per-region structured payload fit for fusion. All four are
addressable tonight without crossing stream boundaries.
