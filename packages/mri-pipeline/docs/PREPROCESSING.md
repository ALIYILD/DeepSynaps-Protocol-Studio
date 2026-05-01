# Structural MRI preprocessing (`deepsynaps_mri.preprocessing`)

## Public API

| Function | Role |
|----------|------|
| `brain_extract` | FSL BET subprocess (`adapters/fsl_bet.py`) |
| `bias_correct_n4` | ANTs N4 via `antspyx` (`adapters/ants_n4.py`) |
| `normalize_orientation` | `nibabel.as_closest_canonical` → RAS/LA+ |
| `normalize_intensity` | Masked z-score inside brain mask |
| `generate_preprocessing_qc` | Scalars + writes `preprocessing_qc.json` |
| `run_structural_preprocessing` | Optional chained pipeline (non-breaking helper) |

Artifacts live under caller-provided `artefacts_dir`, with logs in `artefacts_dir/logs/`.

---

## Required binaries / libraries

| Component | Requirement |
|-----------|----------------|
| **Brain extraction** | FSL `bet` on `PATH` (FSL install). |
| **N4 bias correction** | Python package `antspyx` (optional `[neuro]` extra). |
| **Orientation / intensity / QC** | `nibabel`, `numpy` (typically via `[neuro]`). |

Containers: use an image that includes **FSL** + **Python + antspyx** for full functionality.

---

## Likely failure modes

| Symptom | Cause |
|---------|--------|
| `bet_not_found` | FSL not installed or not on `PATH`. |
| `antspyx_missing` | Neuro extras not installed in environment. |
| `bet_failed` / non-zero exit | Bad input contrast, extreme frac, corrupt NIfTI. |
| `n4_failed` | antspyx/runtime error on unconventional dims. |
| `shape_mismatch` | Brain mask grid differs from image (must match spatial shape). |
| `zero_variance` | Constant intensities inside mask. |
| `nifti_no_orientation` | Missing qform/sform (from upstream validation). |

---

## Validation checklist (manual / QA)

- [ ] Input NIfTI passes `validation.validate_nifti_header` before preprocessing.
- [ ] After BET: `_brain.nii.gz` and `_brain_mask.nii.gz` exist; mask voxel count > 0.
- [ ] After N4: output file exists; intensities finite (spot-check with nibabel).
- [ ] After reorient: `orientation_after` matches expected RAS/LA+ convention for your site.
- [ ] QC JSON: `preprocessing_qc.json` present; `mean_in_brain` / `std_in_brain` plausible for modality.
- [ ] Logs: `logs/bet_subprocess.log`, `logs/n4_antspy.log` retained for audit.

---

## Pipeline integration (future)

Call `run_structural_preprocessing` or individual steps from `pipeline.py` **after** ingest and **before** registration if you want bias-corrected RAS brains—coordinate with `MRIReport` schema changes separately.
