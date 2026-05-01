# Morphometry and reporting (`deepsynaps_mri.morphometry_reporting`)

## Scope

Aggregates **FreeSurfer/FastSurfer** `aseg.stats`, **SynthSeg** `volumes.csv`, optional **regional thickness JSON** (from `cortical_thickness.summarize_regional_thickness`), and **asymmetry indices** into report-ready structures. **No HTML/PDF** — only Pydantic models and JSON artefacts.

## API

| Function | Purpose |
|----------|---------|
| `compute_regional_volumes` | Parse `aseg.stats` or SynthSeg CSV → `RegionalVolumesResult` + `morphometry/regional_volumes.json`. |
| `compute_asymmetry_indices` | Pairwise L/R AI → `AsymmetryResult` + `asymmetry_indices.json`. |
| `summarize_morphometry` | QC flags + `MorphometryProvenance` → `morphometry_summary.json`. |
| `generate_mri_analysis_report_payload` | Full `MRIAnalysisReportPayload` + optional `mri_analysis_report_payload.json`. |

## Schemas

Defined in `schemas.py`: `RegionalVolumeRow`, `RegionalVolumesResult`, `AsymmetryIndexRow`, `AsymmetryResult`, `MorphometryProvenance`, `MorphometrySummary`, `MRIAnalysisReportPayload`.

## Example JSON

See `demo/mri_morphometry_payload_example.json` for a trimmed payload shape for frontend wiring.

## Provenance & QC

- `MorphometryProvenance` records **paths only** (no PHI in filenames if you follow patient-scoped dirs).
- `MorphometrySummary.qc_flags` includes `regional_volumes_failed`, `thickness_summary_missing`, and `asymmetry_flagged:<region>` when |AI| ≥ threshold (default 10%).

## Normative z-scores

This module **does not** compute ISTAGING z-scores; it fills `NormedValue.value` only. Wire normative DB in `structural.extract_structural_metrics` or a follow-up pass.
