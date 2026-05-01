# Structural segmentation (`deepsynaps_mri.segmentation`)

## API

| Function | Purpose |
|----------|---------|
| `segment_tissues_gm_wm_csf` | 3-class CSF / GM / WM (FSL FAST). |
| `segment_subcortical_structures` | Subcortical ROIs (FSL FIRST). |
| `compute_segmentation_qc` | Label fractions + entropy on DeepSynaps tissue seg. |

## Standard artefact layout

Under caller-provided `artefacts_dir`:

```
segmentation/
  tissue_seg_deepsynaps.nii.gz      # int: 0=bg, 1=CSF, 2=GM, 3=WM
  tissue_pve0_csf.nii.gz            # FAST PVE (optional copy)
  tissue_pve1_gm.nii.gz
  tissue_pve2_wm.nii.gz
  tissue_segmentation_manifest.json
  subcortical_first_labels.nii.gz   # FSL FIRST native label IDs
  subcortical_segmentation_manifest.json
  segmentation_qc.json              # from compute_segmentation_qc
  logs/
    fast_subprocess.log
    first_subprocess.log
```

## Source tools → DeepSynaps functions

| Source | Wrap first? | DeepSynaps entry | Notes |
|--------|-------------|------------------|-------|
| **FSL FAST** | **Yes (P0)** | `segment_tissues_gm_wm_csf` | Stable 3-class; subprocess in `adapters/fsl_fast.py`. |
| **FSL FIRST** | **Yes (P0)** | `segment_subcortical_structures` | Needs skull-stripped T1; `adapters/fsl_first.py`. |
| **ANTs Atropos** | P1 | *(future `adapters/ants_atropos.py`)* | Wrap when multimodal tissue seg or ANTs-only containers. |
| **FreeSurfer aseg** | P1 | Reuse `structural.run_synthseg` / FastSurfer | Already in `structural.py`; map aseg labels to DeepSynaps manifest in a follow-up. |
| **SynthSeg** | P1 | Same | Unified cortical+subcortical; export `labels.nii.gz` + JSON LUT in future PR. |

**Reimplement:** Do not reimplement FAST/FIRST/Atropos optimization. **Do implement** QC stats (fractions, entropy) in Python.

## Inputs

- **Tissue FAST:** Brain-extracted or bias-corrected T1 recommended (full head increases CSF misclassification).
- **FIRST:** Strongly prefer BET/skull-stripped input per FSL guidance.

## Validation

`segment_*` optionally runs `validate_nifti_header` before invoking FSL.

## Downstream

- Tissue masks: threshold `tissue_seg_deepsynaps` for GM/WM/CSF for morphometry and QC.
- Subcortical: join FIRST label IDs to structure names via FSL documentation; volumes via `numpy.bincount` × voxel volume.
