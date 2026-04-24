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

## Quickstart
```bash
pip install -e .
docker pull deepmi/fastsurfer:latest   # optional GPU segmentation path
# SynthSeg ships with FreeSurfer; install FreeSurfer 7.4+ separately.

export DATABASE_URL="postgresql://user:pass@localhost:5432/deepsynaps"
ds-mri analyze --dicom-dir ./sample_dicoms/ --out ./demo_out/
```

See `CLAUDE.md` for the Claude Code CLI memory file used to implement the TODOs.
