# MRI Stream — Upgrades Applied

**Date:** 2026-04-26 night-shift
**Scope:** decision-support hardening, no autonomous diagnosis, hedged
language everywhere.
**Branch policy:** edits live on the working tree only — no commit, no
push (per task brief).

---

## 1. Strict upload validation — new module + router wiring

**New file:** `packages/mri-pipeline/src/deepsynaps_mri/validation.py`
(286 LOC). Public entry points:

- `ALLOWED_EXTENSIONS = ('.nii', '.nii.gz', '.zip')`
- `validate_extension(filename) -> ValidationResult`
- `validate_nifti_magic(blob) -> ValidationResult` — reads NIfTI-1 / NIfTI-2
  magic bytes at offset 344 (transparently decompresses gzipped NIfTI head).
- `validate_zip_archive(blob) -> ValidationResult` — `zipfile.testzip()` +
  empty-archive guard.
- `validate_nifti_header(path) -> ValidationResult` — deep nibabel-backed
  check: dim ≥ 3, no zero/negative dims, voxel sizes finite + in
  `[0.1, 10] mm`, sform OR qform set, affine non-singular. Gracefully
  skipped when nibabel not installed.
- `validate_upload_blob(filename, blob) -> ValidationResult` — one-shot.

**Router wired:** `apps/api/app/routers/mri_analysis_router.py:506-518`
calls `validate_upload_blob` immediately after the size cap check; failure
surfaces as a 422 with the structured `code` from `ValidationResult`
(`unsupported_extension`, `nifti_too_short`, `nifti_bad_magic`,
`zip_corrupt`, etc.). Falls back gracefully when the package isn't
importable in slim deployments.

**Acceptance check:** `pytest apps/api/tests/test_mri_analysis_router.py
-k upload_rejects` → 4 tests pass (guest, .dcm extension, garbage NIfTI,
corrupt zip).

---

## 2. Brain-age safety wrapper

**New file:** `packages/mri-pipeline/src/deepsynaps_mri/safety.py`
(`safe_brain_age` function, 110 LOC).

**Schema extension:**
`packages/mri-pipeline/src/deepsynaps_mri/schemas.py:155-178` adds four
optional fields to `BrainAgePrediction` and a new `not_estimable` literal
to `status`:
- `confidence_band_years: tuple[float, float] | None`
- `calibration_provenance: str | None`
- `not_estimable_reason: str | None`
- `top_contributing_regions: list[dict]` (explainability hook)

**Pipeline wiring:**
`packages/mri-pipeline/src/deepsynaps_mri/structural.py:62-83`
`attach_brain_age` now routes the raw model output through
`safe_brain_age` so the structural metrics object always carries a
plausibility-checked envelope.

**Router wiring:** `apps/api/app/routers/mri_analysis_router.py:340-354`
re-runs `safe_brain_age` inside `_report_from_row` so legacy DB rows
also gain confidence band + provenance on read.

**Behaviour:**
- predicted age outside `[3, 100] y` → status flipped to `not_estimable`,
  `predicted_age_years` wiped to `None`, original value preserved on
  `error_message` for audit.
- |brain-age gap| > 30 y → same.
- NaN predicted → same.
- ok-path → adds `confidence_band_years = (predicted - mae, predicted + mae)`
  clamped to plausibility window.
- `dependency_missing` / `failed` envelopes pass through unchanged with
  provenance attached.

**Acceptance check:** 18 tests in `tests/test_safety.py` cover every branch.

---

## 3. Per-region structured findings + safer interpretation language

**New helpers (in `safety.py`):**
- `severity_label_from_z(z)` — z bucketed to `mild/moderate/marked`.
- `format_observation_text(...)` — hedged template; never says
  "diagnosis"; always trails with "requires clinical correlation".
- `build_finding(...)` — produces a stable dict carrying
  `requires_clinical_correlation: True`.
- `findings_from_structural(metrics)` — converts `StructuralMetrics`
  cortical + subcortical dicts into the new `findings` array.

**Router wiring:** `apps/api/app/routers/mri_analysis_router.py:356-360`
attaches `findings` to the report payload.

**Schema extension:** `NormedValue` (schemas.py:130-139) adds optional
`reference_range`, `confidence`, `model_id` fields — back-compat: every
existing payload deserialises unchanged because all are optional.

**Acceptance check:**
`test_report_includes_findings_array_and_disclaimer` asserts no
"diagnos*" substring; `requires_clinical_correlation: True`.

---

## 4. Multimodal fusion-ready producer payload

**New endpoint:**
`GET /api/v1/mri/report/{analysis_id}/fusion_payload` — returns a stable
`mri.v1` envelope the qEEG-MRI fusion stream can consume without walking
the full `MRIReport`.

**Implementation:** `safety.to_fusion_payload(report)` in
`packages/mri-pipeline/src/deepsynaps_mri/safety.py`. Output shape:

```jsonc
{
  "schema_version": "mri.v1",
  "subject_id": "...",
  "modality": "mri",
  "qc": { "passed": bool, "warnings": [...], "mriqc_status": "...",
          "incidental_status": "...", "any_incidental_flagged": bool },
  "findings": [build_finding(...)],
  "brain_age": { "status", "predicted_age_years", "brain_age_gap_years",
                 "confidence_band_years", "calibration_provenance",
                 "model_id", "not_estimable_reason" },
  "stim_targets": [{ "target_id", "modality", "region_name", "mni_xyz",
                     "confidence", "method",
                     "requires_clinician_review": true }],
  "provenance": { "pipeline_version", "norm_db_version", "disclaimer" }
}
```

**Acceptance check:** `test_fusion_payload_returns_narrow_shape` +
`test_fusion_payload_404_when_analysis_missing` (api router suite) +
4 tests in `test_safety.py`.

**Handoff to fusion stream:** consume
`/api/v1/mri/report/{id}/fusion_payload` and key on `schema_version` for
forward-compat. Symmetry with qEEG payload deferred — not crossing
streams tonight.

---

## 5. Explainability hook on brain-age + stim targets

`BrainAgePrediction.top_contributing_regions: list[dict]` field added
(default empty). The pipeline does not populate it tonight (no SHAP /
Captum integration on the worker image), but the field is in the API
contract so a future shift can wire it without breaking consumers.

`StimTarget.confidence` was already a `Literal["low","medium","high"]`
on the schema — no change needed.

---

## 6. Demo / test fixture: hand-built valid NIfTI-1

`apps/api/tests/test_mri_analysis_router.py:25-66` adds
`_make_valid_nifti_gz()` which builds a 348-byte NIfTI-1 header + 256
bytes of zero data, gzipped — used by every test that uploads an MRI.
This lets the strict-validation gate accept the test fixture without
adding nibabel as a test-time dependency.

---

## File-level change list (line refs after edits)

| File | Lines | Change |
|---|---|---|
| `packages/mri-pipeline/src/deepsynaps_mri/__init__.py` | 1-39 | Re-export `safe_brain_age`, `to_fusion_payload`, `validate_upload_blob`, etc. |
| `packages/mri-pipeline/src/deepsynaps_mri/schemas.py` | 130-139 | `NormedValue` gains `reference_range`, `confidence`, `model_id`. |
| `packages/mri-pipeline/src/deepsynaps_mri/schemas.py` | 155-178 | `BrainAgePrediction` gains `not_estimable` status, `confidence_band_years`, `calibration_provenance`, `not_estimable_reason`, `top_contributing_regions`. |
| `packages/mri-pipeline/src/deepsynaps_mri/structural.py` | 62-83 | `attach_brain_age` wraps with `safe_brain_age`. |
| `packages/mri-pipeline/src/deepsynaps_mri/validation.py` | (new) | Upload + NIfTI + zip validation helpers. |
| `packages/mri-pipeline/src/deepsynaps_mri/safety.py` | (new) | Brain-age safety wrap, safer-language helpers, fusion payload producer. |
| `packages/mri-pipeline/tests/test_validation.py` | (new) | 26 tests. |
| `packages/mri-pipeline/tests/test_safety.py` | (new) | 18 tests. |
| `apps/api/app/routers/mri_analysis_router.py` | 75-93 | Lazy-import safety + validation helpers. |
| `apps/api/app/routers/mri_analysis_router.py` | 339-410 | `_report_from_row` adds findings + safer brain-age. |
| `apps/api/app/routers/mri_analysis_router.py` | 506-518 | Upload endpoint runs `validate_upload_blob`. |
| `apps/api/app/routers/mri_analysis_router.py` | 791-836 | New `/fusion_payload` endpoint. |
| `apps/api/tests/test_mri_analysis_router.py` | 25-66 | Valid NIfTI fixture. |
| `apps/api/tests/test_mri_analysis_router.py` | 670-803 | 7 new tests for upload validation, findings array, brain-age provenance, fusion payload. |

---

## Acceptance criteria check (per task_board.md Stream 2)

- [x] NIfTI validator accepts clinical scans, rejects malformed —
  `validate_upload_blob` + tests; existing `_make_valid_nifti_gz`
  passes; garbage / wrong-extension / corrupt zip all 422.
- [x] Brain-age model produces calibrated estimates with confidence —
  `confidence_band_years` + `calibration_provenance` always attached;
  out-of-range → `not_estimable`.
- [x] Incidental-finding triage flags pathology with evidence references
  — already in place; surfaced via `qc_warnings` and the new safer
  `findings` array.
- [ ] DTI/connectivity outputs ready for fusion — `to_fusion_payload`
  exposes structural findings + brain-age + stim targets +
  qc_warnings; functional/diffusion blocks not yet folded into the
  narrow envelope (handoff: easy follow-up).
- [x] Reports include modality QC flags and limitations —
  `qc_warnings`, `qc.mriqc.status`, `qc.incidental` all surfaced;
  hedged interpretation language enforced.

---

## Blockers / handoffs

- **DevOps:** install `nibabel` (already a declared dep but not in the
  thin slim image), `antspyx` (registration), `freesurfer 7.4+` (for
  `mri_synthseg`), and ideally `fastsurfer` Docker image on the worker
  so `extract_structural_metrics` can return real values instead of an
  empty `StructuralMetrics`.
- **Fusion stream:** consume `GET /api/v1/mri/report/{id}/fusion_payload`
  and key on `schema_version == "mri.v1"`. Add functional / diffusion
  rollups to the producer (mri side) once you confirm the consumer
  expectations.
- **Frontend:** none — page already renders `qc_warnings`, brain-age
  band (mae line), confidence chips. New `findings` array is additive
  and ignored by the existing renderer until a follow-up shift wires it.
- **No commits made.** Working-tree edits only, per task brief.
