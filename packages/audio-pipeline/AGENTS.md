# DeepSynaps Audio / Voice Analyzer — Agent Instructions

These instructions apply only to work inside the DeepSynaps Audio / Voice
Analyzer scope. This package is for healthcare audio and speech analysis in
neurology, neuromodulation, cognition, and respiratory screening workflows.

Do not use this file as guidance for MRI, video, qEEG, or unrelated product
areas.

---

## 1. Project purpose

The DeepSynaps Audio / Voice Analyzer provides clinical AI analysis of patient
voice and speech recordings. It is designed for structured, repeatable voice
tasks captured in clinic, during telehealth visits, or remotely on smartphones.

Primary use-cases:

- neurological voice biomarkers for Parkinson's disease, dystonia, dysarthria,
  stroke, TBI, DBS/VNS side effects, and rehabilitation monitoring;
- neuromodulation follow-up for tracking vocal biomarker changes before and
  after TMS, tDCS, TPS, CES, tVNS, DBS/VNS programming, or related workflows;
- cognitive speech markers for PD-MCI, MCI, AD-spectrum risk/context support,
  and longitudinal speech/language monitoring;
- optional respiratory and voice health screening from cough, breath, sustained
  phonation, and related audio tasks;
- telehealth-ready task batteries using smartphone or browser recordings:
  sustained vowel, reading passage, counting, DDK, free speech, picture
  description, story recall, and optional cough/breath tasks.

All outputs are biomarker, risk, monitoring, or decision-support outputs. They
must require clinician interpretation.

---

## 2. Architecture principles

Keep the package modular. The intended top-level analysis modules are:

- `audio_ingestion` - recording/import, metadata handling, de-identification,
  sample-rate normalization, storage references, task manifests;
- `acoustic_feature_engine` - F0, intensity, jitter, shimmer, HNR, CPP, MFCCs,
  formants, nonlinear phonation features, DDK timing, and spectral features;
- `speech_linguistic_engine` - transcript-aware timing, pauses, lexical,
  syntactic, semantic, and task-rubric features;
- `neurological_voice_analyzers` - PD, dysarthria, dystonia, stroke/TBI, and
  neuromodulation response scorecards;
- `cognitive_speech_analyzers` - PD-MCI, MCI, AD-spectrum speech/language
  feature profiles and risk/context scores;
- `respiratory_voice_analyzer` - cough, breath, exhalation, and respiratory
  voice screening features;
- `reporting` - report schemas, FeatureStore rows, PatientGraph payloads, and
  clinician-facing summaries;
- `workflow_orchestration` - task batteries, baseline selection, provenance,
  retry handling, and end-to-end pipeline execution.

Prefer wrap-first, reimplement-second:

- use established external libraries for acoustic/DSP primitives where
  appropriate, such as Praat/Parselmouth, pyworld, librosa, scipy, torchaudio,
  soundfile, and VAD libraries;
- keep external libraries behind adapters so business logic does not depend on
  a specific backend;
- place ML model calls behind small model/scorer interfaces;
- reimplement algorithms only when a dependency is unsuitable, unavailable,
  too heavy for the target extra, or clinically/audit-wise opaque.

Strong provenance is required:

- track model names, model versions, feature-definition versions, parameters,
  task prompt IDs, library backend names, and QC decisions;
- preserve enough configuration to reproduce a result from the immutable input
  audio asset;
- treat provenance as part of the output contract, not optional metadata.

---

## 3. Coding rules

- Use typed Python everywhere.
- Every public function must have explicit input and return types.
- Prefer small, testable modules and pure functions where possible.
- Avoid hidden global state. Pass configuration explicitly through schemas or
  function parameters.
- Define inputs and outputs with dataclasses or Pydantic models.
- Keep side effects isolated to ingestion, storage, pipeline orchestration,
  API/worker boundaries, and reporting writers.
- Use structured result objects instead of ad hoc dictionaries in core analysis
  code.
- Separate these concerns cleanly:
  - raw audio handling;
  - feature extraction;
  - ML scoring;
  - report and payload formatting.
- Do not make feature extraction depend on ASR unless the feature explicitly
  requires a transcript.
- Use clear names with units where applicable, for example
  `f0_mean_hz`, `jitter_local_pct`, `hnr_db`, `speech_rate_wpm`.
- If a function is a placeholder, include an explicit TODO block explaining:
  - what must be implemented;
  - which backend or method is expected;
  - expected inputs and outputs;
  - any validation or clinical constraints.

---

## 4. Dependency rules

- Keep the lightweight core install small.
- Put heavy DSP, ASR, and ML dependencies in extras such as `[audio]`,
  `[voice]`, `[asr]`, `[ml]`, or backend-specific extras.
- External feature libraries and ML backends must be wrapped through adapters.
  Do not call heavy backend APIs directly from business logic, report assembly,
  or API handlers.
- Medical ASR backends such as Whisper, Vosk, or other transcript engines are
  optional. ASR is not required for core acoustic analysis.
- Code must degrade clearly when an optional backend is missing:
  - raise a typed, actionable error at adapter boundaries; or
  - mark the related output as unavailable with an explanatory QC/provenance
    note.
- Do not add a heavyweight dependency for one narrow calculation without first
  checking whether an existing dependency or adapter pattern covers it.
- Do not couple test fixtures or core schemas to a proprietary model provider.

---

## 5. Testing rules

- Use pytest for all modules.
- Add tests with every new core module or public function.
- Prefer deterministic, synthetic audio fixtures for unit tests:
  - sine waves for F0 and intensity sanity checks;
  - amplitude-modulated sine waves for shimmer-like behavior;
  - frequency-modulated sweeps or chirps for contour behavior;
  - noise mixtures for SNR and QC;
  - clipped synthetic signals for clipping detection;
  - silent and too-short signals for compliance failures.
- Tests must not depend on internet access, remote services, cloud model calls,
  or external patient data.
- Optional backends must have skippable tests, for example when librosa,
  Parselmouth/Praat, pyworld, torch, or an ASR backend is absent.
- Use small fixtures. Do not commit large audio files unless explicitly approved
  and clinically/legal reviewed.
- Do not include PHI or real patient recordings in tests.
- Test both successful extraction and QC failure/warning paths.
- Snapshot report tests should assert stable schemas and key fields, not brittle
  formatting details.

---

## 6. Logging and provenance

- Use `logging.getLogger(__name__)`; do not use `print()` in library code.
- Prefer structured logs for ingestion, feature extraction, analyzer scoring,
  report generation, and workflow orchestration.
- Do not log raw transcripts, patient names, file paths containing PHI, or raw
  audio-derived identifiers unless they are already de-identified and intended
  for audit use.
- Attach QC objects to feature and analyzer outputs. QC should cover, where
  relevant:
  - noise / SNR;
  - clipping;
  - low volume;
  - speech or voice activity presence;
  - task duration and compliance;
  - baseline comparability;
  - ASR confidence and transcript quality when transcripts are used.
- Every scoring function must include provenance for:
  - model or ruleset name;
  - model/ruleset version;
  - feature-definition version;
  - parameters and thresholds;
  - training cohort tags or calibration cohort tags when applicable;
  - optional backend name/version when known.
- Analyzer outputs should state limitations and quality caveats alongside
  scores and top drivers.

---

## 7. External model and tool usage

Define adapter interfaces for external tools and models. At minimum, keep these
families isolated:

- acoustic feature backends;
- VAD / segmentation backends;
- ASR / transcript backends;
- PD voice scoring models;
- dysarthria or dystonia scoring models;
- cognitive speech scoring models;
- respiratory/cough scoring models.

Keep external models and their parameters encapsulated in a `/backends` or
`/models` subpackage. Suggested shape:

```text
src/deepsynaps_audio/
├── backends/
│   ├── acoustic_base.py
│   ├── praat_backend.py
│   ├── librosa_backend.py
│   ├── pyworld_backend.py
│   ├── vad_base.py
│   └── asr_base.py
└── models/
    ├── scoring_base.py
    ├── pd_voice.py
    ├── cognitive_speech.py
    └── respiratory.py
```

Adapters should:

- expose a small typed interface;
- return project schemas, not backend-native objects;
- map backend errors into project-level exceptions or QC statuses;
- include backend name and version in provenance;
- keep raw model outputs available only when needed for audit/debug and safe to
  persist.

Business logic should depend on interfaces and schemas, not concrete backend
classes.

---

## 8. DO NOT

- Do not claim diagnosis, definitive disease detection, or treatment decisions
  in code, report labels, API names, tests, or user-facing strings.
- Use terms such as "biomarker", "risk score", "monitoring score",
  "profile", "screening signal", or "decision-support output".
- Do not embed PHI in logs, test fixtures, exception messages, unencrypted
  artifacts, or committed files.
- Do not persist raw audio outside patient-scoped, access-controlled storage.
- Do not mix UI/API concerns with analysis modules.
- Do not hard-code neuromodulation protocols into voice analysis. Voice analysis
  may link to stimulation/session context, but protocol selection and treatment
  logic belong elsewhere.
- Do not make ASR mandatory for core acoustic biomarkers.
- Do not silently ignore poor-quality recordings. Return explicit QC warnings
  or failure statuses.
- Do not hide model versions, thresholds, task prompts, or scoring parameters.
- Do not introduce MRI, video, qEEG, or unrelated analyzer behavior into this
  package.

---

## How future agents should use this file

Before editing `packages/audio-pipeline`, read this file and keep the work
within the audio/voice analyzer scope. Use it as the local contract for module
boundaries, dependency choices, testing expectations, provenance requirements,
and clinical-safety language. If a task conflicts with this file, pause and
surface the conflict before implementing.
