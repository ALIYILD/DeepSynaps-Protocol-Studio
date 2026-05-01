# DeepSynaps MRI / fMRI Analyzer

Sibling module to `deepsynaps_qeeg_analyzer`. A clinician uploads structural MRI, rs-fMRI, DTI and/or task fMRI; the portal returns a full neuroimaging report, **MNI + patient-space stim-target coordinates** for TPS / tFUS / rTMS, an interactive colored overlay on the patient's own T1, and literature-cited protocols retrieved through the shared MedRAG hypergraph over the 87k-paper DeepSynaps DB.

This module is the **MRI Analyzer** page in the DeepSynaps Studio clinical dashboard sidebar.

## What it outputs
- Structural biomarker report (cortical thickness, subcortical volumes, WM hyperintensities)
- Functional network maps (DMN, Salience, Central Executive, Sensorimotor, Language)
- Subject-specific rTMS-MDD target via sgACC-anticorrelation (Fox et al.)
- TPS target ROIs (DLPFC, Broca/Wernicke, precuneus — AD protocol)
- tFUS targets (sgACC, M1, hippocampus, thalamus) with derated in-situ pressure guidance
- DTI: FA / MD maps + bundle tractography (arcuate, corticospinal, uncinate)
- MedRAG evidence chain — cited protocols from the 87k DeepSynaps corpus
- PDF + HTML report with colored overlays

## Status
Scaffold + specification. See `docs/MRI_ANALYZER.md` for the full 80-page spec.

## Architecture note (monolith vs modular)

The **shipping clinical path** is `pipeline.run_pipeline()` — a stage union over
`io`, `registration`, `structural`, `qc`, `fmri`, `dmri`, `targeting`, etc.

A **lean DAG orchestrator** lives in `workflow_orchestration.py` (persisted state,
provenance JSON) for restartable worker jobs; it is optional for product flows.

**Subprocess adapters** are being centralized under `src/deepsynaps_mri/adapters/`
(`dcm2niix`, shared subprocess helpers); more CLIs will migrate there incrementally.

Dedicated modules named `preprocessing.py`, `segmentation.py`, … from the long-term
roadmap may appear later — until then, boundaries are `pipeline.py` + adapters +
domain helpers such as `structural_stats.py`.

**Stage manifests:** `run_pipeline` writes JSON under `artefacts/manifests/`
(`ingest_manifest.json`, `register_manifest.json`) plus `structural/structural_metrics_manifest.json`
when stages run.

See also `docs/PROMPT_AUDIT_MRI.md` and `docs/INTEGRATION_REVIEW_MRI.md`.

## Quickstart
```bash
pip install -e .
docker pull deepmi/fastsurfer:latest   # optional GPU segmentation path
# SynthSeg ships with FreeSurfer; install FreeSurfer 7.4+ separately.

export DATABASE_URL="postgresql://user:pass@localhost:5432/deepsynaps"
ds-mri analyze --dicom-dir ./sample_dicoms/ --out ./demo_out/
```

See `CLAUDE.md` for the Claude Code CLI memory file used to implement the TODOs.
