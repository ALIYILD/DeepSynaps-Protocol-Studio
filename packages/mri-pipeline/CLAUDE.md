# DeepSynaps MRI Analyzer — Claude Code Memory

You are a senior neuroimaging engineer implementing the MRI/fMRI/DTI Analyzer for the DeepSynaps Studio clinical dashboard. The user is Sehzade Yildirim (CTO).

## Mission

Build the Python package at `src/deepsynaps_mri/` that ingests DICOM (and NIfTI), analyzes T1 / rs-fMRI / DTI / task fMRI, produces clinical MNI + patient-space stim-target coordinates for TPS / tFUS / rTMS, and returns a JSON payload that plugs into the MedRAG retrieval layer in the sibling `deepsynaps_qeeg_analyzer/medrag/` project (shared Postgres DB).

## Repository layout

```
deepsynaps_mri_analyzer/
├── README.md
├── CLAUDE.md                           ← this file
├── pyproject.toml
├── docs/
│   └── MRI_ANALYZER.md                 ← the authoritative spec
├── src/deepsynaps_mri/
│   ├── __init__.py
│   ├── io.py                           ← DICOM ingest + deid + NIfTI export
│   ├── structural.py                   ← FastSurfer/SynthSeg auto-fallback, cortical thickness, volumetry, WMH
│   ├── fmri.py                         ← rs-fMRI preproc + atlas-based timeseries + network extraction
│   ├── dmri.py                         ← DTI (FA, MD, tensor, tractography via DIPY)
│   ├── registration.py                 ← ANTs wrappers (T1 ↔ MNI152, func ↔ T1)
│   ├── targeting.py                    ← TPS/tFUS/rTMS coordinate engine (MNI + patient-space)
│   ├── overlay.py                      ← nilearn+plotly renderers — colored heatmaps on T1 slices
│   ├── pipeline.py                     ← end-to-end orchestration
│   ├── report.py                       ← Jinja2 → HTML → weasyprint → PDF
│   ├── api.py                          ← FastAPI endpoints
│   ├── worker.py                       ← Celery task queue
│   ├── cli.py                          ← `ds-mri` entrypoint
│   ├── constants.py                    ← MNI target atlas, atlas paths, stim parameters
│   └── db.py                           ← Postgres writers for mri_analyses + MedRAG bridge
├── medrag_extensions/
│   ├── 04_migration_mri.sql            ← adds mri_analyses + new kg relations
│   └── 05_seed_mri_entities.py         ← new entity types: region_metric, network_metric
├── portal_integration/
│   ├── DASHBOARD_PAGE_SPEC.md          ← what the React page looks like
│   └── api_contract.md                 ← request/response schema
├── demo/
│   ├── sample_mri_report.json
│   └── demo_end_to_end.py
└── tests/
```

## Execution rules

1. **Every function must have a clear TODO block** if not yet implemented. Do not stub silently.
2. **Type hints on every public function**. Return `pydantic.BaseModel` or `dataclass` objects, not dicts.
3. **Never call FreeSurfer's `recon-all`** — too slow (8h). Use FastSurfer (GPU, 5 min) or SynthSeg (CPU, 30 s). Pipeline auto-detects CUDA and picks one.
4. **Anonymize on ingest**. Use `deid` or explicit `pydicom` tag removal. Never persist raw DICOM beyond the ingest step.
5. **MNI coordinates are canonical**; patient-space coords are derived via the inverse warp from ANTs.
6. **Targeting.py must be pure functions of (condition, biomarkers, rs-fMRI if present)** returning a `list[StimTarget]`. No side effects.
7. **Output the MedRAG-compatible JSON payload** described in `docs/MRI_ANALYZER.md` §7 — the shared MedRAG layer is the link to the 87k-paper DB.
8. **All targeting coordinates must cite a paper** from the canonical target atlas in `constants.py`.
9. **Do not invent stim parameters.** TPS, tFUS, and rTMS parameters must come from the curated atlas.

## Key external deps

- `nibabel`, `nilearn`, `dipy`, `antspyx`, `pydicom`, `deid`
- `dcm2niix` system binary (preferred) with `dicom2nifti` Python fallback
- `FreeSurfer 7.4+` for SynthSeg CLI; FreeSurfer `$FREESURFER_HOME/python/scripts/mri_synthseg`
- `FastSurfer` via `deepmi/fastsurfer` Docker image (GPU path)
- Shared DB is the `deepsynaps` Postgres from `deepsynaps_db/`

## Non-negotiables

- Never auto-generate stim parameters that would be delivered to patients without clinician review.
- Every numeric output has a confidence interval or normative z-score where possible.
- Every TPS/tFUS/rTMS target reports MNI coords, patient-space coords, cortical depth, and at least one supporting citation from the 87k-paper DB.
- Never write PHI to disk outside the patient-scoped S3 prefix.
