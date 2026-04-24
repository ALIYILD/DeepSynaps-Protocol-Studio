# DeepSynaps qEEG Analyzer — Claude Code memory

This file is read by Claude Code CLI on every session. Keep it current.

## Product
Web portal where clinicians / users upload resting-state EEG (`.edf`, `.edf+`, `.bdf`, or BrainVision `.vhdr`) and get back a qEEG report containing:
- band-power topomaps (absolute + relative, δ θ α β γ)
- 1/f aperiodic slope + peak alpha frequency (SpecParam)
- intra-band connectivity (wPLI, coherence)
- eLORETA source-level power mapped to Desikan-Killiany ROIs
- normative z-scores (age/sex-matched) with |z|>1.96 / |z|>2.58 flags
- AI narrative grounded in the DeepSynaps Studio literature DB (~87k papers)

## Non-negotiable stack
- **MNE-Python ≥ 1.7** — I/O, preprocessing, source localization, plotting
- **PyPREP** — bad-channel detection + robust average reference
- **MNE-ICALabel** — automatic IC classification; drop non-brain/other with proba > 0.7
- **autoreject** (local) — residual epoch rejection
- **MNE-Connectivity** — wPLI, coherence, AEC, PLV
- **SpecParam (fooof)** — 1/f decomposition, PAF
- **MNE-BIDS** — every write is BIDS-compliant
- **FastAPI + Celery + Redis** — portal API + async worker
- **Postgres `deepsynaps` database** — already exists (see `deepsynaps_db/`), reuse for RAG

## File format support (in priority order)
1. `.edf` / `.edf+`  → `mne.io.read_raw_edf`
2. `.vhdr` (BrainVision triplet) → `mne.io.read_raw_brainvision`
3. `.bdf` (BioSemi)  → `mne.io.read_raw_bdf`
4. `.set` (EEGLAB)  → `mne.io.read_raw_eeglab`
5. `.fif` (Elekta/Neuromag) → `mne.io.read_raw_fif`

## Channel & montage rules
- Minimum accepted: 16 channels after bad-channel rejection
- Auto-detect montage, fall back to `mne.channels.make_standard_montage('standard_1020')`
- Reject upload if channels cannot be mapped to 10-20 positions
- Handle common synonym sets (T7=T3, T8=T4, P7=T5, P8=T6) explicitly

## Frequency bands (use these exact definitions everywhere)
```python
FREQ_BANDS = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta":  (13.0, 30.0),
    "gamma": (30.0, 45.0),
}
```

## Epoching (resting state)
- 2.0 s epochs, 50% overlap
- Discard first 10 s and last 5 s of the recording
- Target ≥ 40 clean epochs after artifact rejection; warn if fewer

## Preprocessing defaults
- Bandpass: 1.0 – 45.0 Hz (zero-phase FIR, firwin, `skip_by_annotation='edge'`)
- Notch: 50 Hz (UK default). Config override for 60 Hz
- Resample: 250 Hz
- Reference: PyPREP robust average, then average re-reference after bad-channel interpolation

## ICA config
- Method: `picard` (fast) with fallback to `infomax`
- `n_components`: 0.99 cumulative explained variance (or min(n_channels-1, 30))
- Fit on a high-pass (1 Hz) copy; apply to the original
- Drop ICs where ICLabel proba > 0.7 AND label ∈ {eye, muscle, heart, line_noise, channel_noise}

## Source localization
- Template: `fsaverage` (no subject MRI required)
- BEM: `mne.datasets.fetch_fsaverage()` then standard 3-layer BEM
- Inverse method: `eLORETA` (default), fallback `sLORETA`
- Output ROI-level band power on Desikan-Killiany atlas (68 ROIs)

## Testing
- Every module needs pytest tests using fixtures in `tests/fixtures/`
- Fixture EDF: 30-second snippet from OpenNeuro `ds004446` (permissive license)
- Use `tmp_path` for any file output

## Regulatory posture
- Label outputs "research/wellness use" until CE Class IIa is secured
- Never use the words "diagnosis", "diagnostic", or "treatment recommendation" in user-facing strings
- Always log pipeline version + DB version into every report

## DO NOT
- Add MATLAB dependencies (FieldTrip, EEGLAB wrappers — use native Python only)
- Use proprietary file readers — everything through MNE
- Hard-code electrode positions — use `mne.channels.make_standard_montage`
- Trust the raw file's metadata blindly — validate sfreq, channel names, units
- Write to disk outside the BIDS derivatives folder

## Postgres schema hooks (see deepsynaps_db/ project)
```sql
-- Already exist:
-- papers, authors, paper_authors, modalities, paper_modalities,
-- conditions, paper_conditions, mesh_terms, paper_mesh, keywords,
-- paper_keywords, extracted_evidence

-- Add for qEEG analyzer:
CREATE TABLE IF NOT EXISTS qeeg_analyses (
    analysis_id   UUID PRIMARY KEY,
    user_id       UUID NOT NULL,
    filename      TEXT,
    file_hash     TEXT UNIQUE,
    status        VARCHAR(32),              -- queued|running|done|failed
    features      JSONB,                    -- all extracted features
    zscores       JSONB,                    -- normative z-scores
    flagged_conditions TEXT[],              -- e.g. {'adhd','anxiety'}
    report_pdf_s3 TEXT,
    report_html_s3 TEXT,
    pipeline_version VARCHAR(16),
    norm_db_version VARCHAR(16),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);
```

## Coding style
- Type hints required on all public functions
- Docstrings in NumPy style
- Log via `logging.getLogger(__name__)` — never `print()` in library code
- Pure functions where possible; side-effects isolated in `pipeline.py` + workers
