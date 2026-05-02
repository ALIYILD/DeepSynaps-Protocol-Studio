# DeepSynaps Audio / Voice Analyzer — Claude Code memory

This file is read by Claude Code CLI on every session. Keep it current.

## Mission

Build the Python package at `src/deepsynaps_audio/` that ingests
clinical voice recordings (sustained vowel, reading passage, counting,
DDK, free speech, optional cough/breath), computes acoustic + clinical
+ neurological + (v2) cognitive + (v2) respiratory features, scores
them against demographic-binned norms and the patient's own baseline,
and returns a JSON payload + HTML/PDF report that plugs into the
shared MedRAG retrieval layer in the sibling
`packages/qeeg-pipeline/src/deepsynaps_qeeg/` and
`packages/mri-pipeline/src/deepsynaps_mri/` projects (shared Postgres
`deepsynaps` database).

## Product

Web portal where clinicians, SLPs, and remote patients submit short
voice recordings and get back a voice report with:

- per-task acoustic indices (F0, jitter, shimmer, HNR, NHR, CPPS, LTAS
  slope, formants, MFCC, optional eGeMAPS);
- clinical composites (AVQI-v3, DSI-like, GRBAS auto-estimator,
  voice-break metrics);
- neurological voice biomarkers (PD likelihood, dysarthria severity +
  subtype hint, DDK metrics, dystonia composite, RPDE / DFA / PPE);
- (v2) prosodic + lexical + syntactic features and an MCI-risk score;
- (v2) cough / breath segmentation and a respiratory acoustic risk
  score;
- demographic-binned z-scores and patient-as-own-baseline deltas with
  minimum-detectable-change flags;
- AI narrative grounded in the DeepSynaps Studio literature DB
  (~87k papers) via the shared MedRAG layer.

## Authoritative spec

See `AUDIO_ANALYZER_STACK.md` at the package root. Treat it as the
contract for module names, function signatures, MVP-vs-v2 split, and
the next 5 implementation tasks. Do not silently re-interpret the
architecture without updating the spec.

## Non-negotiable stack

- **Parselmouth (Praat in Python)** — F0, jitter, shimmer, HNR, NHR,
  formants, voice-break analysis. The clinical voice ground truth.
- **librosa** + **soundfile** + **scipy** — generic audio I/O, MFCC,
  spectrogram, resampling.
- **openSMILE (eGeMAPS / ComParE)** — standardised voice biomarker
  vector. Behind the `[acoustic-extras]` install extra; pipeline
  guards the import and falls back to a Praat-only feature pack.
- **DisVoice** — phonation / articulation / prosody / glottal feature
  packs, used by `neurological/parkinson.py` and
  `neurological/dysarthria.py`.
- **faster-whisper** (preferred) and **vosk** (offline fallback) —
  ASR, used only when the linguistic engine needs transcripts.
  Wrapped behind a single adapter (`linguistic/transcription.py`); no
  other module imports them directly.
- **pyloudnorm**, **webrtcvad** — telehealth-grade quality control
  (LUFS loudness, VAD speech ratio).
- **pyAudioAnalysis**, **panns_inference** — cough / breath
  segmentation and classification (v2 respiratory analyzer only).
- **scikit-learn** + small **lightgbm** models for PD-likelihood,
  dysarthria severity, MCI risk. Models pinned by hash and version
  string; no live downloads.
- **Jinja2 + WeasyPrint** — same reporting toolchain as MRI/qEEG.
- **FastAPI + Celery + Redis** — same workflow toolchain as MRI/qEEG.
- **Postgres `deepsynaps`** — already exists (see `deepsynaps_db/`),
  add an `audio_analyses` table that mirrors `qeeg_analyses` and
  `mri_analyses`.

## Supported file formats (in priority order)

1. `.wav`  — preferred, lossless
2. `.flac`
3. `.ogg`
4. `.mp3` / `.m4a` (re-encode via ffmpeg on ingest)
5. `.webm` (telehealth browser recordings)

Always normalise to mono float32 at the target sample rate. Default:
**16 kHz** for speech / cognitive / DDK tasks, **44.1 kHz** for
sustained-vowel voice-quality tasks (AVQI / DSI need the higher band
for spectral tilt).

## Task protocol catalogue

Use these protocol slugs everywhere a "task" is referenced:

```python
TASK_PROTOCOLS = {
    "sustained_vowel_a":       {"target_sr": 44100, "min_duration_s": 3.0},
    "sustained_vowel_a_long":  {"target_sr": 44100, "min_duration_s": 5.0},
    "reading_passage":         {"target_sr": 16000, "min_duration_s": 20.0},
    "counting_1_20":           {"target_sr": 16000, "min_duration_s": 6.0},
    "ddk_pataka":              {"target_sr": 16000, "min_duration_s": 5.0},
    "ddk_papapa":              {"target_sr": 16000, "min_duration_s": 5.0},
    "free_speech":             {"target_sr": 16000, "min_duration_s": 30.0},
    "picture_description":     {"target_sr": 16000, "min_duration_s": 30.0},
    "verbal_fluency_semantic": {"target_sr": 16000, "min_duration_s": 60.0},
    "verbal_fluency_phonemic": {"target_sr": 16000, "min_duration_s": 60.0},
    "voluntary_cough":         {"target_sr": 16000, "min_duration_s": 1.0},
    "deep_breath":             {"target_sr": 16000, "min_duration_s": 5.0},
}
```

## Quality control thresholds (defaults)

- Loudness: target −23 LUFS, accept −30 to −16 LUFS.
- Peak: clip if > −1 dBFS for > 0.1 % of samples.
- SNR: warn if < 15 dB, fail if < 5 dB.
- Speech ratio (VAD): warn if < 0.3 or > 0.95 for non-sustained tasks.
- Sample rate: reject if native sr < 8 kHz.

The QC verdict is `pass | warn | fail`. `fail` blocks downstream
analysis; the API returns a structured "re-record" envelope with
human-readable reasons.

## Frequency / spectral conventions

- Speech band of interest: **80 Hz – 8 kHz**.
- LTAS slope computed across **1 kHz – 10 kHz** (AVQI convention).
- F0 search range: **75–500 Hz** (default), `60–300` for adult male,
  `120–500` for adult female and pediatric.

## Models

- All trained models live in `models/` with the manifest
  `models/MANIFEST.json` listing `name`, `version`, `sha256`,
  `training_set`, `notes`. Pipeline refuses to load a model whose
  hash does not match.
- Bundled v1 models (PD likelihood, dysarthria severity) are
  scikit-learn / lightgbm; export via `joblib`.
- v2 models (GRBAS CNN, MCI risk, cough classifier) may be
  PyTorch — gate them behind a `[ml]` install extra.

## Regulatory posture

- Label outputs "research / wellness use" until CE Class IIa is
  secured. Mirror the wording used by `packages/qeeg-pipeline` and
  `packages/mri-pipeline`.
- Never use the words "diagnosis", "diagnostic", or "treatment
  recommendation" in user-facing strings. Prefer "indicator",
  "biomarker", "tracking", "research finding".
- Always log `pipeline_version`, `model_versions`, `norm_db_version`,
  `file_hash`, and `recorder_fingerprint` into every report and into
  the `audio_analyses` Postgres row.

## Postgres schema hook

```sql
CREATE TABLE IF NOT EXISTS audio_analyses (
    analysis_id        UUID PRIMARY KEY,
    user_id            UUID NOT NULL,
    patient_id         UUID,
    session_id         UUID NOT NULL,
    task_protocol      TEXT NOT NULL,
    file_hash          TEXT,
    status             VARCHAR(32),         -- queued|running|done|failed
    qc                 JSONB,
    features           JSONB,
    indices            JSONB,
    neurological       JSONB,
    cognitive          JSONB,
    respiratory        JSONB,
    zscores            JSONB,
    deltas             JSONB,
    flagged_conditions TEXT[],
    report_pdf_s3      TEXT,
    report_html_s3     TEXT,
    pipeline_version   VARCHAR(16),
    model_versions     JSONB,
    norm_db_version    VARCHAR(16),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    completed_at       TIMESTAMPTZ
);
```

## Coding style

- Type hints on every public function. Return `pydantic.BaseModel` or
  `dataclass` objects (see `schemas.py`), never raw dicts.
- Docstrings in NumPy style. Cite the canonical reference inline when
  re-implementing a published feature (e.g. AVQI-v3 reference,
  Tsanas RPDE/DFA/PPE).
- Log via `logging.getLogger(__name__)` — never `print()` in library
  code.
- Pure functions where possible; side effects (DB writes, S3, queue
  enqueue) isolated in `pipeline.py`, `worker.py`, `db.py`.
- Heavy clinical imports (parselmouth, opensmile, librosa,
  faster-whisper) must be guarded inside the function that uses them
  so the slim install (`pip install -e packages/audio-pipeline`)
  works for the metadata + schemas layer alone. Mirror the slim
  pattern used by `packages/qeeg-pipeline` and `packages/mri-pipeline`.

## DO NOT

- Do not ship raw ASR transcripts to the EHR or to the report —
  transcripts are an intermediate artefact for linguistic features.
- Do not invent stim parameters, neuromodulation protocols, or
  diagnostic thresholds. Use the curated atlas the MRI/qEEG modules
  share.
- Do not auto-categorise patients into hard diagnostic classes —
  always report a continuous score with drivers and a confidence.
- Do not bypass `quality_control.gate()` for downstream feature
  extraction. If QC fails, the API returns a structured "re-record"
  envelope and stops.
- Do not write PHI to disk outside the patient-scoped S3 prefix.
- Do not hard-depend on Whisper/vosk models being present — every
  linguistic feature path must degrade to "unavailable" if the
  transcription adapter is not installed.

## Cross-module contract

The audio analyzer outputs the same shape of envelope as the qEEG and
MRI analyzers, so the portal can render a unified longitudinal
timeline per patient. See
`portal_integration/api_contract.md` once it lands; until then the
authoritative shape lives in `schemas.py::ReportBundle`.
