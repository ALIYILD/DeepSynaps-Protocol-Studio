## Source localization (MNE-Python 1.12.1)

This package implements EEG source localization using MNE-Python inverse methods on the **fsaverage** template (default) or a subject-specific FreeSurfer recon when available.

### What we compute

- **Forward model**: EEG forward solution on `fsaverage` (or `bids_subject` if provided).
- **Noise covariance**: regularized with `method="auto"`, using:
  - **empty-room** recording if provided, else
  - an **eyes-closed baseline** estimate from resting EEG (epochs preferred).
- **Inverse**: `eLORETA` (default), with support for `sLORETA`, `dSPM`, `MNE`.
- **ROI output**: Desikan–Killiany (`aparc`) ROI-level band power as a **68 × 5** table:
  - rows: DK atlas labels excluding `unknown` (hemi-suffixed, e.g. `bankssts-lh`)
  - cols: `delta/theta/alpha/beta/gamma`
- **3D figures (optional)**: static PNG snapshots (inflated surface, hemi split, lateral/medial) saved when an output directory is provided and the 3D backend is available.

### Quality guard (pipeline)

Source localization is **skipped** when:

- fewer than **19 EEG channels** are available after cleaning, or
- data quality indicates low confidence (e.g., too few retained epochs, or too many rejected channels).

When skipped, the pipeline still completes and the report will show “unavailable / skipped”.

### Regulatory / labeling

All source-localization outputs in the report are labeled as:

- **Decision support only**
- **Research / wellness use only**

They are **not** presented as diagnostic or treatment recommendations.

### Developer API

Public functions live in `deepsynaps_qeeg.source`:

- `build_forward_model(raw, subject="fsaverage", subjects_dir=None, bids_subject=None) -> mne.Forward`
- `estimate_noise_covariance(raw=None, epochs=None, empty_room_raw=None) -> mne.Covariance`
- `compute_inverse_operator(raw, forward, noise_cov) -> mne.minimum_norm.InverseOperator`
- `apply_inverse(raw_or_evoked, inverse_operator, method="eLORETA") -> stc / list[stc]`
- `extract_roi_band_power(source_estimates, subject="fsaverage", subjects_dir=None) -> pandas.DataFrame`
- `save_stc_snapshots(stc, out_dir, subject="fsaverage", subjects_dir=None, kind="power") -> dict[str,str]`

