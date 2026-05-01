# Cortical thickness (`deepsynaps_mri.cortical_thickness`)

## What is wrapped vs native

| Component | Wrapped (external) | Native (Python) |
|-----------|------------------|-----------------|
| Per-vertex thickness | FreeSurfer/FastSurfer `lh.thickness` / `rh.thickness` (file copy + nibabel read) | QC stats, manifests |
| Voxel-wise thickness | ANTs `ants.kelly_kapowski` (DiReCT) via `adapters/ants_kelly_kapowski.py` | QC on NIfTI |
| Regional DK means | — | Parse `lh.aparc.stats` / `rh.aparc.stats` |

**Do not reimplement** DiReCT or FreeSurfer’s surface deformation in DeepSynaps.

## API

- **`compute_cortical_thickness`** — `engine=freesurfer_surfaces` (copy morphs to `cortical_thickness/fsnative/`) or `engine=ants_kelly_kapowski` (seg + GM/WM PVEs).
- **`summarize_regional_thickness`** — reads aparc.stats → `regional_thickness_summary.json`.
- **`compute_thickness_qc`** — vertex (lh+rh morph) or volume (NIfTI) distribution checks.

## Artefact layout

```
artefacts_dir/cortical_thickness/
  fsnative/
    lh.thickness  rh.thickness        # FS engine
  kelly_kapowski_thickness.nii.gz     # ANTs engine
  regional_thickness_summary.json
  cortical_thickness_manifest.json
  cortical_thickness_qc.json
  logs/
    kelly_kapowski.log
```

## Algorithm choices (summary)

1. **FastSurfer / FreeSurfer surfaces** — Default clinical path aligned with existing `structural.py` expectations: thickness lives on the **white-surface mesh** as standard FS morph files. Regional summaries use **Desikan-Killiany aparc.stats** (68 cortical parcels per hemisphere in typical outputs).
2. **ANTs KellyKapowski** — Alternative when you have **multi-label seg + GM/WM probability maps** (e.g. FSL FAST PVEs + tissue seg). Produces a **volume** thickness map; it is **not** on the same vertex grid as FS without additional resampling.
3. **Reporting** — Map `RegionalThicknessRow.region_id` (e.g. `lh.superiortemporal`) to `StructuralMetrics.cortical_thickness_mm` keys in a future pipeline glue PR; this module stays I/O + stats only.

## Validation plan

1. **Unit**: synthetic aparc.stats parsing; synthetic morph QC; mocked KellyKapowski.
2. **Integration** (manual / CI with neuro image):
   - Run FastSurfer subject; confirm `compute_cortical_thickness` + `summarize_regional_thickness` + `compute_thickness_qc` on real `surf/` and `stats/`.
   - Run FAST + KellyKapowski on a skull-stripped T1; inspect thickness NIfTI range (typical median ~2–3 mm adult T1).
3. **Clinical audit**: store `manifest_path`, engine string, and input paths on every analysis record; flag QC when median outside 0.5–5 mm or >5% vertices &lt;1 mm or &gt;6 mm (configurable later).

Decision-support only — thickness z-scores against normative databases belong in `extract_structural_metrics` / ISTAGING wiring, not in this module.
