# DeepSynaps qEEG Analyzer

A production qEEG pipeline for DeepSynaps Studio. Users upload `.edf` / `.edf+` / `.bdf` / BrainVision `.vhdr` files and receive a clinical-grade report (band power topomaps, connectivity, eLORETA sources, normative z-scores, AI narrative grounded in the DeepSynaps literature DB).

## Start here

1. Read **[`QEEG_ANALYZER_STACK.md`](QEEG_ANALYZER_STACK.md)** — full decision record: why MNE-Python, why MNE-ICALabel, normative DB strategy, regulatory posture, deployment shape.
2. Read **[`CLAUDE.md`](CLAUDE.md)** — memory file that Claude Code CLI loads every session. Contains the non-negotiable stack choices, band definitions, epoching rules, and DO NOTs.
3. Scaffold is already in `src/deepsynaps_qeeg/` — `io.py` is complete, `pipeline.py` is a skeleton with clear TODOs. Drive Claude Code CLI against each TODO.

## Build order (feed to Claude Code CLI, one prompt per stage)

```bash
# 0. bootstrap
pip install -e ".[dev]"

# 1. I/O — already done in src/deepsynaps_qeeg/io.py

# 2. preprocessing
claude-code "Implement src/deepsynaps_qeeg/preprocess.py per CLAUDE.md.
  Use PyPREP for bad-channel detection and robust average reference,
  then bandpass 1-45 Hz, notch 50 Hz, resample to 250 Hz.
  Return a cleaned mne.io.Raw. Add tests in tests/test_preprocess.py."

# 3. artifact rejection
claude-code "Implement src/deepsynaps_qeeg/artifacts.py per CLAUDE.md.
  Fit ICA (picard, n_components=0.99) on a 1 Hz high-pass copy,
  label with MNE-ICALabel, drop non-brain/non-other components with proba>0.7,
  then run autoreject (local) on 2 s epochs with 50% overlap.
  Return clean mne.Epochs."

# 4. spectral features
claude-code "Implement src/deepsynaps_qeeg/features/spectral.py per CLAUDE.md.
  Compute absolute and relative band power per channel per band using
  Welch (4 s window, 50% overlap). Add SpecParam fit for aperiodic slope
  and peak alpha frequency. Return a nested dict keyed by band and metric."

# 5. connectivity
claude-code "Implement features/connectivity.py using mne-connectivity.
  wPLI and coherence matrices (n_channels x n_channels) per band.
  Return dict[band] -> numpy array."

# 6. asymmetry + graph metrics
claude-code "Implement features/asymmetry.py (frontal alpha asymmetry F3/F4, F7/F8)
  and features/graph.py (clustering coefficient, char path length, small-worldness
  via networkx on the wPLI matrix, thresholded at top 20% of edges)."

# 7. source localization
claude-code "Implement source/eloreta.py: use mne.datasets.fetch_fsaverage(),
  build forward model, compute noise covariance from 1 Hz high-pass,
  apply eLORETA inverse, return ROI-level band power on Desikan-Killiany atlas."

# 8. normative z-scoring (scaffold, uses built-in toy norms until real DB is loaded)
claude-code "Implement normative/zscore.py with a pluggable norm DB interface.
  Ship a toy norm DB loaded from a CSV. Input features dict, age, sex.
  Output z-scores dict and a list of flagged features where |z|>1.96."

# 9. reporting
claude-code "Implement report/generate.py: Jinja2 + WeasyPrint to build a PDF
  from features + zscores. Include topomap PNGs via MNE plotting.
  Also implement report/rag.py: query the deepsynaps Postgres DB
  (see deepsynaps_db/) for papers matching the flagged SOZO conditions
  and top 3 modalities, return top 10 abstracts for the LLM narrative."

# 10. API + worker
claude-code "Implement api/app.py (FastAPI) with POST /upload (signed S3) and
  GET /analyses/{id}. Implement api/worker.py (Celery) that calls
  pipeline.run_full_pipeline and writes results to Postgres qeeg_analyses."
```

## Run the pipeline locally (after stages 2–7 are implemented)

```bash
python -m deepsynaps_qeeg.cli /path/to/patient.edf --age 35 --sex F
```

## License

Proprietary — DeepSynaps Studio.
