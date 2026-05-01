# Cortical surfaces (`deepsynaps_mri.cortical_surfaces`)

## Wrap vs port

**Initial production approach: wrap external tools only.** Cortical surface placement (topology correction, spherical inflation, white/pial deformation) is a multi-year research codebase in FreeSurfer, FastSurfer, and BrainSuite. Porting those algorithms into DeepSynaps is out of scope; the module:

- Runs **FastSurfer** via `adapters/fastsurfer_surfaces.py`, or
- **Imports** an existing FreeSurfer/FastSurfer subject `surf/` tree (`external_freesurfer_layout`).

**BrainSuite** is referenced in the API as `source="brainsuite"` and returns a clear `brainsuite_not_implemented` until a dedicated adapter exists.

## API

| Function | Role |
|----------|------|
| `reconstruct_cortical_surfaces` | Run FastSurfer or copy external `surf/` into `artefacts_dir/cortical_surfaces/fsnative/`. |
| `export_surface_meshes` | Write GIFTI (pointset + triangles) for Niivue / VTK. |
| `compute_surface_qc` | Vertex/face counts, bbox extent, edge-length stats. |

## Standard layout

```
artefacts_dir/
  cortical_surfaces/
    fsnative/
      lh.white  lh.pial  rh.white  rh.pial
    logs/
      fastsurfer_subprocess.log
    cortical_surfaces_manifest.json
    cortical_surface_qc.json          # from compute_surface_qc
  surfaces_fs/                        # FastSurfer --sd (default)
    <subject_id>/surf/...
```

GIFTI export directory (caller-chosen):

```
gifti_out/
  lh_white.surf.gii
  lh_pial.surf.gii
  rh_white.surf.gii
  rh_pial.surf.gii
  surface_export_manifest.json
```

## Engineering note: runtime and dependency cost

| Item | Cost |
|------|------|
| **FastSurfer** | GPU strongly recommended; wall time often **~5–30 min** subject to hardware; requires FreeSurfer license file for some builds and `run_fastsurfer.sh` on PATH or Docker. |
| **Disk** | Per subject: surf files **~50–150 MB** typical; full FastSurfer subject dir can be **multi‑GB** if segmentation + volumes retained. |
| **Python** | `nibabel` ([neuro] extra) for geometry read/write and GIFTI. |
| **CI / API workers** | Surface jobs should run as **async workers** or dedicated GPU queue; default API slim image may not include FastSurfer — surface stage should be optional with clear `fastsurfer_not_found` envelopes. |

## Integration

- Visualization: pass GIFTI paths to Niivue or three.js loaders.
- Reports: embed QC JSON and vertex counts; link manifest for provenance.
