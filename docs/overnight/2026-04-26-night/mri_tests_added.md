# MRI Stream — Tests Added

**Date:** 2026-04-26 night
**Owner:** MRI Specialist agent

---

## New test files

### 1. `packages/mri-pipeline/tests/test_validation.py` (26 tests)

- Extension whitelist parameterised matrix (`scan.nii`, `scan.NII`,
  `scan.nii.gz`, `Scan.NII.GZ`, `bundle.zip` accepted; `scan.dcm`,
  `scan.exe`, `scan.txt`, `noext` rejected with code
  `unsupported_extension`).
- NIfTI-1 magic-byte check accepts a hand-built valid gzipped NIfTI;
  rejects truncated payload (`nifti_too_short`); rejects wrong magic
  (`nifti_bad_magic`); survives a malformed gzip stream without raising.
- Zip sanity accepts a real one-member zip; rejects non-zip bytes;
  rejects empty bytes; rejects a zero-member archive.
- End-to-end `validate_upload_blob` smoke tests for accept + reject paths.

### 2. `packages/mri-pipeline/tests/test_safety.py` (18 tests)

- `safe_brain_age` paths: None input → `dependency_missing`; passthrough
  for already-failed envelope; ok-path adds `confidence_band_years` +
  provenance; below-floor / above-ceiling / excessive-gap / NaN inputs
  flip status to `not_estimable`; band clamped to plausibility window.
- `severity_label_from_z` bucket boundaries.
- `format_observation_text` includes "Observation:", direction word,
  hedged severity, "requires clinical correlation", and never says
  "diagnosis".
- `build_finding` carries `requires_clinical_correlation: True` and the
  computed severity bucket.
- `findings_from_structural` only emits regions with z-score / flagged.
- `to_fusion_payload` shape smoke test (schema_version, modality,
  qc, findings, brain_age, stim_targets, provenance) — works for both
  `MRIReport` and dict input; brain-age block omitted cleanly when
  structural is absent.

### 3. `apps/api/tests/test_mri_analysis_router.py` (7 new tests added)

Existing 17 tests retained and reworked to use a hand-built valid NIfTI
gzip fixture (`_make_valid_nifti_gz`) so the new strict-validation gate
accepts them.

New tests:

- `test_upload_rejects_non_whitelisted_extension` — `.dcm` raw upload
  → 422 `unsupported_extension`.
- `test_upload_rejects_garbage_nifti_magic` — `.nii.gz` of zeros → 422
  `nifti_too_short` / `nifti_bad_magic`.
- `test_upload_rejects_corrupt_zip` — random bytes in `.zip` → 422
  `zip_corrupt` / `zip_unreadable`.
- `test_report_includes_findings_array_and_disclaimer` — verifies the
  new safer `findings` array, `requires_clinical_correlation: True`, and
  that no observation text contains "diagnos*".
- `test_report_brain_age_carries_calibration_provenance` — verifies the
  ok-path brain-age payload carries `calibration_provenance` and
  `confidence_band_years`.
- `test_fusion_payload_returns_narrow_shape` — new
  `/api/v1/mri/report/{id}/fusion_payload` returns the
  `mri.v1` envelope.
- `test_fusion_payload_404_when_analysis_missing`.

---

## Test-run results (2026-04-26 night, after upgrades)

```
$ PYTHONPATH=packages/mri-pipeline/src pytest packages/mri-pipeline/tests/ -v 2>&1 | tail -50
======================== 74 passed, 1 warning in 0.24s =========================

$ pytest apps/api/tests/test_mri_analysis_router.py -v 2>&1 | tail -50
======================== 24 passed, 1 warning in 6.57s =========================

$ cd apps/web && node --test src/pages-mri-analysis-qc.test.js src/pages-mri-analysis-brainage.test.js 2>&1 | tail -10
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
```

**Total MRI-stream test coverage: 116 passing tests.**
Baseline before tonight: 65 passing (30 pipeline + 17 router + 18 web).
Net delta: +51 tests, all green.

---

## Coverage gaps still present (handoff to next shift)

- `packages/mri-pipeline/src/deepsynaps_mri/structural.py:234`
  `extract_structural_metrics` is still a TODO stub — no test asserts
  real ROI extraction because there's nothing to extract yet. Track this
  in the dev-blockers list (FastSurfer / SynthSeg+ binary required).
- `validate_nifti_header` (deep nibabel-backed checks) only has the
  unit smoke (uses gracefully-degraded "skip" path because nibabel
  isn't installed in the CI image we ran tonight). Once nibabel lands
  in the worker image, add tests that exercise the rejected-affine and
  out-of-range voxel paths.
- Frontend: existing `pages-mri-analysis-qc.test.js` /
  `-brainage.test.js` cover the QC banner + brain-age card. No new
  frontend test added tonight because the new payload fields
  (`findings`, `confidence_band_years`, `calibration_provenance`) are
  backward-compatible — existing UI either ignores them or already
  renders them. A follow-up shift should add a small assertion that
  `renderBrainAgeCard` surfaces the new "± MAE" line (already
  implemented at pages-mri-analysis.js:1750-1754) when the API supplies
  `confidence_band_years`.
