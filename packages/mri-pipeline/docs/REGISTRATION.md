# MRI registration (`deepsynaps_mri.registration`)

## Purpose

Align subject structural MRI to **MNI152NLin2009cAsym** (same convention as `constants.MNI_TEMPLATE` and fMRIPrep) for neuromodulation targeting, atlas overlays, and morphometry in a common space.

## Public API (typed)

| Function | Role |
|----------|------|
| `register_to_mni` | Full registration with optional on-disk artefacts (warped image, copied transforms, JSON manifest). |
| `register_t1_to_mni` | Legacy in-memory `Transform` (used by `pipeline.py` today). |
| `apply_transform` | `ants.apply_transforms` wrapper — apply forward or inverse chain to any scalar/label image. |
| `invert_transform` | Returns **MNI → native** transform list from a bundle (or errors if only forwards are known). |
| `compute_registration_qc` | Pearson r + mean abs diff vs fixed reference (same grid as warped output). |
| `warp_points_to_patient` | MNI mm → native mm via inverse chain (for `constants` atlas targets). |
| `warp_image_to_mni` | Legacy helper using in-memory `Transform`. |

## Wrap vs reimplement

| Capability | Recommendation |
|------------|----------------|
| **Nonlinear SyN / SyNCC** | **Wrap** `antspyx` (`ants.registration`) — do not reimplement optimization. |
| **FSL FLIRT affine** | **Wrap** `flirt` CLI when needed for fast affine-only or hybrid pipelines. |
| **FSL FNIRT** | **Wrap** `fnirt` / `applywarp` — field provenance lives in FSL `.mat`/`.nii.gz` warps. |
| **Jacobian / overlap QC** | **Wrap** ANTs `CreateJacobianDeterminantImage` or **implement** simple voxel stats (this module starts with Pearson r on intensities). |
| **Coordinate push/pull** | **Wrap** `ants.apply_transforms_to_points` — reimplementing resampling kernels is error-prone. |

## Artefact layout (`artefacts_dir`)

When `register_to_mni(..., artefacts_dir=...)` is set:

```
artefacts_dir/
  registration/
    t1_warped_to_mni.nii.gz
    forward_00_*.nii.gz   # copied from ANTs temp output
    inverse_00_*.nii.gz
    registration_manifest.json
```

Optional QC: `compute_registration_qc(..., artefacts_dir=...)` writes `registration_qc.json`.

## Structured logging

`register_to_mni` logs engine, transform type, and moving/fixed paths at INFO. Failures log full tracebacks at ERROR.

## Target mapping (downstream)

1. **Atlas targets** (`TargetAtlasEntry.mni_xyz`) live in MNI mm.
2. Load `MniRegistrationBundle` from manifest or DB fields: `inverse_transform_paths`.
3. **Native overlay:** `apply_transform(fixed_ref=native_T1, moving=atlas_roi_nifti, transform_list=inverse, interpolator=nearestNeighbor)` **or** `warp_points_to_patient([(x,y,z)], xfm)` after rebuilding `Transform` from paths + in-memory warped image if needed.
4. **Forward path:** warp native labels/stat maps to MNI for cohort analysis using `forward_transform_paths`.

Always store **both** forward and inverse file paths and the **atlas label** (`MNI152NLin2009cAsym`) with every analysis record.

## Dependencies

- **`antspyx`** — registration + `apply_transforms`.
- **`nibabel`**, **`scipy`** — QC (optional `[neuro]` aligns with nibabel in practice).

## Failure modes

- Missing moving NIfTI, corrupt headers, OOM during SyN.
- `antspyx` not installed in slim environments (`code=antspyx_missing`).
- Applying transforms with wrong `fixed` reference (order and grid must match ANTs conventions).
- QC Pearson r meaningless if fixed and warped are not on the same voxel grid.
