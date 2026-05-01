# MRI ingestion layer (`deepsynaps_mri.ingestion`)

Typed entry points for bringing **DICOM series** and **NIfTI** files into the MRI pipeline. Built on:

- `io.py` — de-identification, `dcm2niix` (subprocess) / `dicom2nifti` fallback
- `validation.py` — upload-style checks (extension, NIfTI magic, zip integrity, optional nibabel header depth)

## Functions

| Function | Purpose |
|----------|---------|
| `import_dicom_series(...)` | De-ID DICOMs into `work_dir/deidentified`; optional `convert_to_nifti` into `nifti_out_dir` |
| `detect_series_metadata(dicom_root)` | Group files by `SeriesInstanceUID`; return `list[SeriesMetadata]` |
| `convert_to_nifti(dicom_dir, out_dir, ...)` | Wrap `io.convert_dicom_to_nifti` with `ConversionResult` + optional `dcm2niix` log file |
| `validate_mri_input(path, kind="auto")` | Validate a **path** (file or directory): NIfTI, ZIP, or DICOM tree |

## JSON-friendly outputs

All result dataclasses expose `.to_dict()` for logging and API responses.

## Dependencies

- **Always:** core package deps (see `pyproject.toml`)
- **Neuro extra:** `pydicom`, `nibabel`, `dicom2nifti` for full behaviour (`pip install -e '.[neuro]'`)
- **System:** `dcm2niix` recommended on PATH for production conversion

## Related

- `AGENTS.md` (repo root) — provenance and wrap-first rules
- `docs/MRI_ANALYZER.md` — full analyser spec
