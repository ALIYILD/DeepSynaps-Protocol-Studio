# DeepSynaps Audio / Voice Analyzer — Implementation Tickets

These tickets are scoped only to the Audio / Voice Analyzer for healthcare
voice/speech analysis. They intentionally exclude MRI, video, and general UI
work except where an API/reporting contract is required for audio-specific
outputs.

Priority legend:

- **P0** - MVP neuromodulation / neurology path.
- **P1** - Next layer after MVP foundations are stable.
- **P2** - Later / phase 2.

Risk legend:

- **Low** - Mostly schema, glue, deterministic logic, or docs.
- **Medium** - DSP/clinical feature logic, optional dependency handling, or
  cross-module integration.
- **High** - ML scoring, clinical validation, language/cognitive inference, or
  respiratory screening models.

---

## audio_ingestion

### AUDIO-ING-001 — Scaffold audio package and core schemas

- **Priority:** P0
- **Goal:** Create the Python package foundation and typed schemas used by all
  downstream modules.
- **Files/directories likely to be created or modified:**
  - `packages/audio-pipeline/pyproject.toml`
  - `packages/audio-pipeline/src/deepsynaps_audio/__init__.py`
  - `packages/audio-pipeline/src/deepsynaps_audio/schemas.py`
  - `packages/audio-pipeline/src/deepsynaps_audio/constants.py`
  - `packages/audio-pipeline/tests/test_schemas.py`
- **Internal/external dependencies:**
  - Internal: `AGENTS.md`, `docs/AUDIO_VOICE_ANALYZER.md`
  - External: `pydantic` or stdlib `dataclasses`
- **Acceptance criteria:**
  - Defines `AudioSession`, `AudioAsset`, `AudioTask`, `AudioQualityReport`,
    `TaskFeatureSet`, `AnalyzerScore`, `AudioVoiceReport`, and provenance/QC
    schemas.
  - Schemas include task IDs, locale, recording context, storage URI, hashes,
    sampling rate, duration, QC status, model/backend versions, and linked
    PatientGraph event IDs.
  - Public fields use explicit units where applicable.
  - Package imports cleanly without optional DSP/ML dependencies installed.
- **Tests required:**
  - Schema construction and serialization tests.
  - Validation failure tests for missing required IDs and invalid QC status.
  - Import test for lightweight package install.
- **Risk level:** Low

### AUDIO-ING-002 — Implement audio asset import and metadata capture

- **Priority:** P0
- **Goal:** Ingest uploaded or recorded audio into immutable `AudioAsset`
  records with hashes and safe metadata.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/ingestion/__init__.py`
  - `src/deepsynaps_audio/ingestion/io.py`
  - `src/deepsynaps_audio/ingestion/metadata.py`
  - `tests/test_ingestion_io.py`
- **Internal/external dependencies:**
  - Internal: core schemas from AUDIO-ING-001
  - External: stdlib `hashlib`, optional `soundfile`/`torchaudio` for metadata
- **Acceptance criteria:**
  - `ingest_audio_file()` accepts bytes or local file references and returns an
    `AudioAsset`.
  - Computes content hash and records original filename only when safe.
  - Captures container/codec, sample rate, channel count, duration, and byte
    length when backend support is available.
  - Does not log PHI or raw transcript/audio content.
  - Raises typed actionable errors for unsupported or unreadable files.
- **Tests required:**
  - Synthetic WAV ingest from bytes.
  - Hash stability test.
  - Unsupported file error test.
  - Logging test ensuring raw bytes and unsafe metadata are not emitted.
- **Risk level:** Medium

### AUDIO-ING-003 — Implement normalization for analysis copies

- **Priority:** P0
- **Goal:** Produce reproducible mono/resampled analysis waveforms while
  preserving the immutable original.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/ingestion/normalize.py`
  - `src/deepsynaps_audio/backends/audio_io_base.py`
  - `src/deepsynaps_audio/backends/soundfile_backend.py`
  - `tests/test_normalize.py`
- **Internal/external dependencies:**
  - Internal: `AudioAsset`, provenance schemas
  - External: `soundfile`, `scipy`, optional `librosa`/`torchaudio`
- **Acceptance criteria:**
  - `normalize_audio()` converts supported audio to mono float waveform at a
    configured sample rate.
  - Records resampling backend, target sample rate, channel policy, and any
    gain/loudness transform in provenance.
  - Does not overwrite the original asset.
  - Handles silence and too-short files without crashing.
- **Tests required:**
  - Stereo-to-mono synthetic signal test.
  - Resampling duration preservation test.
  - Silent waveform test.
  - Optional-backend skip tests.
- **Risk level:** Medium

### AUDIO-ING-004 — Define task battery manifests for clinical voice tasks

- **Priority:** P0
- **Goal:** Represent repeatable voice task batteries for PD/neurology and
  neuromodulation follow-up.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/workflow/task_batteries.py`
  - `src/deepsynaps_audio/constants.py`
  - `tests/test_task_batteries.py`
- **Internal/external dependencies:**
  - Internal: `AudioTask`, `AudioSession`
  - External: none
- **Acceptance criteria:**
  - Provides a `pd_neuromod_v1` task battery with sustained vowel, reading,
    counting, DDK, and short free speech.
  - Each task has a stable task ID, prompt ID, locale, expected duration range,
    required/optional flag, and analysis targets.
  - Task selection does not hard-code stimulation protocols.
- **Tests required:**
  - Manifest validation tests.
  - Stable task ID snapshot tests.
  - Locale fallback tests.
- **Risk level:** Low

---

## acoustic_feature_engine

### AUDIO-FEAT-001 — Implement acoustic backend adapter interfaces

- **Priority:** P0
- **Goal:** Isolate Praat/Parselmouth, librosa, pyworld, scipy, and future
  backends behind typed project interfaces.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/backends/__init__.py`
  - `src/deepsynaps_audio/backends/acoustic_base.py`
  - `src/deepsynaps_audio/backends/praat_backend.py`
  - `src/deepsynaps_audio/backends/librosa_backend.py`
  - `tests/test_acoustic_backends.py`
- **Internal/external dependencies:**
  - Internal: schemas/provenance
  - External: optional `praat-parselmouth`, `librosa`, `numpy`, `scipy`
- **Acceptance criteria:**
  - Business logic depends on a typed adapter interface, not concrete backends.
  - Missing optional backends produce typed errors or unavailable feature
    statuses with provenance notes.
  - Adapter outputs are project schemas, not backend-native objects.
- **Tests required:**
  - Fake backend conformance test.
  - Missing-backend skip/error test.
  - Backend provenance test.
- **Risk level:** Medium

### AUDIO-FEAT-002 — Extract F0 and intensity features

- **Priority:** P0
- **Goal:** Compute core pitch and loudness summaries for sustained vowel and
  connected speech tasks.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/features/acoustic.py`
  - `tests/test_acoustic_features.py`
- **Internal/external dependencies:**
  - Internal: acoustic backend adapters, QC schema
  - External: `numpy`, optional Praat/pyworld/librosa backend
- **Acceptance criteria:**
  - `extract_f0_features()` returns mean, median, SD, range, coefficient of
    variation, voiced fraction, and contour confidence where available.
  - `extract_intensity_features()` returns mean, range, variation, and decay
    summaries with units.
  - Outputs include QC/provenance and validity flags for low voiced fraction or
    poor signal quality.
- **Tests required:**
  - Sine wave F0 sanity test.
  - Chirp / frequency sweep contour test.
  - Amplitude ramp intensity-decay test.
  - Silence/low-voicing validity tests.
- **Risk level:** Medium

### AUDIO-FEAT-003 — Extract perturbation and voice-quality features

- **Priority:** P0
- **Goal:** Compute sustained-phonation features used by SLP and PD biomarker
  workflows.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/features/perturbation.py`
  - `src/deepsynaps_audio/features/acoustic.py`
  - `tests/test_perturbation_features.py`
- **Internal/external dependencies:**
  - Internal: F0 features, acoustic backend adapters
  - External: optional Praat/Parselmouth
- **Acceptance criteria:**
  - `extract_perturbation_features()` returns jitter-local, shimmer-local,
    HNR/NHR where backend validity allows.
  - Rejects or marks unavailable for recordings that are not stable sustained
    phonation.
  - Includes backend name/version and parameter settings in provenance.
- **Tests required:**
  - Stable synthetic vowel-like waveform test.
  - Amplitude modulation shimmer-like behavior test.
  - Invalid connected-speech task test.
  - Optional Praat backend skip test.
- **Risk level:** Medium

### AUDIO-FEAT-004 — Extract cepstral, spectral, MFCC, and formant features

- **Priority:** P0
- **Goal:** Add spectral and articulatory feature families used by PD,
  dysarthria, and dystonia analyzers.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/features/cepstral.py`
  - `src/deepsynaps_audio/features/formants.py`
  - `src/deepsynaps_audio/features/acoustic.py`
  - `tests/test_cepstral_formants.py`
- **Internal/external dependencies:**
  - Internal: acoustic backends, QC schemas
  - External: `numpy`, `scipy`, optional `librosa`, optional Praat/pyworld
- **Acceptance criteria:**
  - Extracts MFCC summary vectors, delta MFCCs when enabled, spectral centroid,
    rolloff, spectral tilt, and CPP where supported.
  - Extracts F1-F4 summaries and vowel-space proxies when task/transcript
    context supports them.
  - Marks formant/vowel-space outputs unavailable when task data is insufficient.
- **Tests required:**
  - Deterministic synthetic waveform feature-shape tests.
  - Chirp spectral-centroid direction test.
  - Optional-backend skip tests.
  - Insufficient-data validity tests.
- **Risk level:** Medium

### AUDIO-FEAT-005 — Implement timing, pause, and DDK feature extraction

- **Priority:** P0
- **Goal:** Quantify speech timing, pauses, and DDK rate/regularity for
  neurological voice assessment.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/features/timing.py`
  - `src/deepsynaps_audio/quality/vad.py`
  - `tests/test_timing_ddk.py`
- **Internal/external dependencies:**
  - Internal: VAD segments, task manifests
  - External: `numpy`, optional VAD backend
- **Acceptance criteria:**
  - Computes speech/phonation time ratio, pause count, pause duration summaries,
    speech rate proxies, and DDK syllable/event rate where feasible.
  - Returns task-compliance and confidence flags.
  - Does not require ASR for core timing outputs.
- **Tests required:**
  - Synthetic pulse-train DDK rate test.
  - Silence-gap pause detection test.
  - Too-short task compliance test.
  - No-speech failure test.
- **Risk level:** Medium

### AUDIO-FEAT-006 — Add nonlinear phonation feature adapters

- **Priority:** P1
- **Goal:** Add RPDE/DFA/PPE-style feature families used in PD voice biomarker
  literature.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/features/nonlinear.py`
  - `src/deepsynaps_audio/backends/nonlinear_base.py`
  - `tests/test_nonlinear_features.py`
- **Internal/external dependencies:**
  - Internal: sustained-vowel validation, F0/period tracking
  - External: optional scientific implementations or local validated routines
- **Acceptance criteria:**
  - Feature functions return typed outputs with validity flags and provenance.
  - Each nonlinear measure documents assumptions and invalid input conditions.
  - No opaque clinical scoring claims are made from these features alone.
- **Tests required:**
  - Deterministic synthetic input tests.
  - Invalid short/aperiodic signal tests.
  - Optional-backend skip tests.
- **Risk level:** High

---

## speech_linguistic_engine

### AUDIO-SPEECH-001 — Define ASR and alignment adapter interfaces

- **Priority:** P1
- **Goal:** Make transcripts optional and keep Whisper/Vosk/medical ASR behind
  adapters.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/backends/asr_base.py`
  - `src/deepsynaps_audio/speech/asr.py`
  - `src/deepsynaps_audio/speech/alignment.py`
  - `tests/test_asr_adapters.py`
- **Internal/external dependencies:**
  - Internal: transcript schemas, provenance
  - External: optional Whisper/Vosk/forced-alignment backends
- **Acceptance criteria:**
  - Core acoustic pipeline runs with no ASR dependency installed.
  - `transcribe_audio()` returns transcript text, word timings when available,
    confidence, language, and backend provenance.
  - Missing ASR backend yields explicit unavailable status, not pipeline failure
    for acoustic-only use-cases.
- **Tests required:**
  - Fake ASR backend test.
  - Missing-backend behavior test.
  - Word-timing serialization test.
- **Risk level:** Medium

### AUDIO-SPEECH-002 — Implement transcript-aware timing features

- **Priority:** P1
- **Goal:** Compute speech rate, articulation rate, and pause features using
  transcript/word timing when available.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/speech/timing.py`
  - `src/deepsynaps_audio/features/timing.py`
  - `tests/test_speech_timing.py`
- **Internal/external dependencies:**
  - Internal: ASR/alignment outputs, VAD timing features
  - External: none required beyond optional ASR
- **Acceptance criteria:**
  - Computes words per minute, articulation rate, mean utterance duration,
    filled-pause counts when tagged, and pause placement summaries.
  - Attaches ASR confidence and transcript-quality caveats.
  - Falls back to acoustic timing when transcript quality is insufficient.
- **Tests required:**
  - Hand-authored transcript timing fixture.
  - Low-ASR-confidence caveat test.
  - No-transcript fallback test.
- **Risk level:** Medium

### AUDIO-SPEECH-003 — Implement lexical and syntactic feature extraction

- **Priority:** P1
- **Goal:** Extract language features needed for cognitive speech risk/context
  analysis.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/speech/lexical.py`
  - `src/deepsynaps_audio/speech/syntax.py`
  - `tests/test_lexical_syntax.py`
- **Internal/external dependencies:**
  - Internal: transcript schemas, locale/task metadata
  - External: optional NLP parser/tokenizer backend
- **Acceptance criteria:**
  - Computes lexical diversity, content-word density, repetition markers,
    pronoun/noun ratio where parser support exists, utterance length, and simple
    syntactic complexity measures.
  - Clearly marks unsupported languages/locales.
  - Does not treat low-confidence ASR as reliable cognitive evidence.
- **Tests required:**
  - Deterministic small transcript fixtures.
  - Unsupported-locale behavior test.
  - Low-confidence transcript caveat test.
- **Risk level:** High

### AUDIO-SPEECH-004 — Implement semantic coherence and task-rubric features

- **Priority:** P2
- **Goal:** Add higher-level semantic features for picture description, story
  recall, and cognitive speech tasks.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/speech/semantics.py`
  - `src/deepsynaps_audio/workflow/task_rubrics.py`
  - `tests/test_semantics.py`
- **Internal/external dependencies:**
  - Internal: transcript schemas, cognitive task manifests
  - External: optional embedding/NLP backend
- **Acceptance criteria:**
  - Supports task rubrics with expected information units.
  - Computes information-unit coverage, repetition, topic drift, and semantic
    coherence when backend support exists.
  - Includes strong caveats around language, ASR quality, and education/culture.
- **Tests required:**
  - Fixed rubric fixture tests.
  - Missing embedding backend skip tests.
  - Low-quality transcript caveat tests.
- **Risk level:** High

---

## neurological_voice_analyzers (PD/dysarthria/dystonia)

### AUDIO-NEURO-001 — Implement transparent PD voice profile scorecard

- **Priority:** P0
- **Goal:** Combine acoustic/timing features into a PD-oriented monitoring
  profile without making diagnostic claims.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/neurological.py`
  - `src/deepsynaps_audio/models/scoring_base.py`
  - `tests/test_pd_voice_profile.py`
- **Internal/external dependencies:**
  - Internal: F0/intensity/perturbation/cepstral/timing features, QC schemas
  - External: none for ruleset v1; optional future ML model adapter
- **Acceptance criteria:**
  - `score_pd_voice_profile()` returns score/tier, top feature drivers,
    limitations, QC caveats, and ruleset/model provenance.
  - Score labels use monitoring language, not diagnosis.
  - Handles missing features by lowering confidence and explaining limitations.
- **Tests required:**
  - Deterministic feature-vector score test.
  - Missing-feature confidence/caveat test.
  - No forbidden diagnosis language in output labels.
- **Risk level:** Medium

### AUDIO-NEURO-002 — Implement dysarthria profile scorecard

- **Priority:** P0
- **Goal:** Summarize dysarthria-relevant patterns from articulation, timing,
  prosody, phonation, and vowel-space features.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/neurological.py`
  - `tests/test_dysarthria_profile.py`
- **Internal/external dependencies:**
  - Internal: DDK/timing, formants, F0/intensity, perturbation features
  - External: none for transparent ruleset v1
- **Acceptance criteria:**
  - `score_dysarthria_profile()` returns profile score, drivers, limitations,
    and feature availability matrix.
  - Separates intelligibility proxies from true clinical intelligibility ratings.
  - Includes task-specific caveats for poor DDK or missing connected speech.
- **Tests required:**
  - Deterministic scoring tests.
  - Missing DDK task caveat test.
  - Output terminology safety test.
- **Risk level:** Medium

### AUDIO-NEURO-003 — Implement dystonia / spasmodic dysphonia profile scorecard

- **Priority:** P1
- **Goal:** Flag strained/unstable voice patterns for clinician review using
  task-contrast features.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/neurological.py`
  - `tests/test_dystonia_profile.py`
- **Internal/external dependencies:**
  - Internal: sustained vowel, reading/free speech, voicing break features
  - External: none for ruleset v1; optional ML model later
- **Acceptance criteria:**
  - `score_dystonia_voice_profile()` returns monitoring score, drivers, and
    task-contrast caveats.
  - Identifies feature patterns such as voicing breaks, strained/unstable
    phonation proxies, and tremor-like modulation where available.
  - Avoids disease-detection language.
- **Tests required:**
  - Synthetic feature-vector scoring tests.
  - Task-missing caveat tests.
  - Forbidden language test.
- **Risk level:** High

### AUDIO-NEURO-004 — Implement neuromodulation response summaries

- **Priority:** P0
- **Goal:** Compare baseline and follow-up voice analyses around stimulation or
  programming events.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/neuromodulation.py`
  - `src/deepsynaps_audio/workflow/baseline.py`
  - `tests/test_neuromodulation_response.py`
- **Internal/external dependencies:**
  - Internal: `AudioVoiceReport`, linked event IDs, feature namespaces
  - External: none
- **Acceptance criteria:**
  - `compute_neuromodulation_response()` returns per-feature deltas, percent
    deltas where meaningful, reliable-change flags, comparability notes, and
    linked stim/session provenance.
  - Does not recommend or alter neuromodulation protocols.
  - Handles non-comparable baseline/device/task contexts conservatively.
- **Tests required:**
  - Pre/post delta calculation tests.
  - Non-comparable baseline warning test.
  - Missing baseline graceful-output test.
  - Protocol-hardcoding absence test.
- **Risk level:** Medium

---

## cognitive_speech_analyzers

### AUDIO-COG-001 — Define cognitive speech task manifests and output schemas

- **Priority:** P1
- **Goal:** Add structured task definitions and typed outputs for MCI/AD and
  PD-MCI speech workflows.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/cognitive.py`
  - `src/deepsynaps_audio/workflow/task_batteries.py`
  - `src/deepsynaps_audio/workflow/task_rubrics.py`
  - `tests/test_cognitive_task_manifests.py`
- **Internal/external dependencies:**
  - Internal: transcript, lexical/syntactic/timing schemas
  - External: none
- **Acceptance criteria:**
  - Defines picture description, story recall, category fluency, and letter
    fluency task manifests.
  - Defines output schemas for cognitive speech profile scores, limitations, and
    transcript-quality caveats.
  - Uses risk/context wording only.
- **Tests required:**
  - Manifest validation tests.
  - Schema serialization tests.
  - Safety terminology tests.
- **Risk level:** Medium

### AUDIO-COG-002 — Implement MCI/AD-context speech profile scorecard

- **Priority:** P2
- **Goal:** Combine pause, lexical, syntactic, semantic, and task-rubric features
  into a cognitive speech risk/context output.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/cognitive.py`
  - `src/deepsynaps_audio/models/cognitive_speech.py`
  - `tests/test_mci_speech_profile.py`
- **Internal/external dependencies:**
  - Internal: speech_linguistic_engine outputs, cognitive task rubrics, QC
  - External: optional NLP/embedding backend
- **Acceptance criteria:**
  - `score_mci_speech_profile()` returns score/tier, top drivers, confidence,
    limitations, and ASR/transcript caveats.
  - Does not run when transcript quality is below configured threshold unless
    explicitly producing an unavailable/caveated output.
  - Includes model/ruleset version and cohort tags where applicable.
- **Tests required:**
  - Deterministic feature-vector score test.
  - Low-ASR-confidence unavailable/caveat test.
  - Forbidden diagnosis-language test.
- **Risk level:** High

### AUDIO-COG-003 — Implement verbal fluency analysis

- **Priority:** P2
- **Goal:** Analyze category and letter fluency tasks for counts, repetitions,
  clusters, switches, and timing.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/cognitive.py`
  - `src/deepsynaps_audio/speech/lexical.py`
  - `tests/test_verbal_fluency.py`
- **Internal/external dependencies:**
  - Internal: transcript timing, task manifests
  - External: optional lexical category dictionaries
- **Acceptance criteria:**
  - `analyze_verbal_fluency()` returns valid item count, repetitions,
    intrusions, cluster/switch proxies, and timing summaries.
  - Locale/language support is explicit.
  - Unavailable dictionary resources produce clear caveats.
- **Tests required:**
  - Hand-authored fluency transcript tests.
  - Repetition/intrusion tests.
  - Unsupported-locale caveat test.
- **Risk level:** High

---

## respiratory_voice_analyzer (optional / phase 2)

### AUDIO-RESP-001 — Define cough/breath task schemas and segmentation adapters

- **Priority:** P2
- **Goal:** Add optional respiratory task support without coupling it to the
  core neurological voice MVP.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/respiratory.py`
  - `src/deepsynaps_audio/backends/respiratory_base.py`
  - `src/deepsynaps_audio/workflow/task_batteries.py`
  - `tests/test_respiratory_schemas.py`
- **Internal/external dependencies:**
  - Internal: audio task schemas, QC
  - External: optional cough/breath segmentation backend
- **Acceptance criteria:**
  - Adds cough, breath, and sustained exhalation task schemas.
  - Keeps respiratory dependencies optional.
  - Respiratory module is not imported by core acoustic MVP unless requested.
- **Tests required:**
  - Schema and manifest tests.
  - Optional-backend missing test.
  - Core import test without respiratory deps.
- **Risk level:** Medium

### AUDIO-RESP-002 — Extract cough and breath acoustic features

- **Priority:** P2
- **Goal:** Compute acoustic descriptors for segmented cough/breath events.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/analyzers/respiratory.py`
  - `src/deepsynaps_audio/features/respiratory.py`
  - `tests/test_respiratory_features.py`
- **Internal/external dependencies:**
  - Internal: respiratory segmentation outputs, QC
  - External: optional DSP/ML respiratory backend
- **Acceptance criteria:**
  - `segment_cough_breath_events()` returns event segments and confidence.
  - `extract_cough_features()` returns count, bout duration, spectral summary,
    and event-quality flags.
  - Outputs are framed as screening/monitoring signals.
- **Tests required:**
  - Synthetic event-burst segmentation tests.
  - No-event behavior test.
  - Optional-backend skip tests.
- **Risk level:** High

### AUDIO-RESP-003 — Add respiratory risk/context score wrapper

- **Priority:** P2
- **Goal:** Provide an optional respiratory screening score with explicit model
  provenance and uncertainty.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/models/respiratory.py`
  - `src/deepsynaps_audio/analyzers/respiratory.py`
  - `tests/test_respiratory_score.py`
- **Internal/external dependencies:**
  - Internal: cough/breath features and QC
  - External: validated external model or local ruleset
- **Acceptance criteria:**
  - `score_respiratory_voice_risk()` returns screening score, confidence,
    model version, cohort tags, and referral-style caveats.
  - Does not claim diagnosis.
  - Can be disabled entirely by configuration.
- **Tests required:**
  - Fake model adapter test.
  - Disabled-config test.
  - Safety terminology test.
- **Risk level:** High

---

## reporting_and_longitudinal

### AUDIO-REP-001 — Build AudioVoiceReport assembly

- **Priority:** P0
- **Goal:** Assemble task features, analyzer outputs, QC, and provenance into a
  stable report JSON contract.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/reporting/report.py`
  - `tests/test_report_contract.py`
  - `demo/sample_audio_report.json`
- **Internal/external dependencies:**
  - Internal: all P0 schemas/features/analyzers
  - External: none
- **Acceptance criteria:**
  - `build_audio_report()` returns `AudioVoiceReport`.
  - Report includes session, tasks, QC, features, analyzer profiles,
    neuromodulation response, provenance, limitations, and version fields.
  - JSON contract is stable enough for API/dashboard integration.
- **Tests required:**
  - Golden sample report contract test.
  - Missing optional analyzer fields test.
  - Serialization/deserialization test.
- **Risk level:** Medium

### AUDIO-REP-002 — Publish audio features to FeatureStore namespace

- **Priority:** P0
- **Goal:** Convert report features into namespaced FeatureStore rows for
  longitudinal trend/fusion use.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/reporting/feature_store.py`
  - `packages/feature-store/feature_repo/audio.py` if feature definitions need
    expansion
  - `tests/test_feature_store_payload.py`
- **Internal/external dependencies:**
  - Internal: FeatureStore conventions, `AudioVoiceReport`
  - External: existing feature-store package
- **Acceptance criteria:**
  - `publish_audio_features()` maps report metrics to namespaced features such
    as `audio.f0.mean_hz`, `audio.jitter.local_pct`, and
    `audio.pd.hypophonia_score`.
  - Includes timestamp, units, source, QC status, and provenance references.
  - Does not publish invalid/unavailable features as valid numeric rows.
- **Tests required:**
  - Feature mapping tests.
  - Invalid feature exclusion test.
  - Unit/source/provenance assertion tests.
- **Risk level:** Medium

### AUDIO-REP-003 — Add PatientGraph audio_analysis event bridge

- **Priority:** P0
- **Goal:** Publish completed audio reports as append-only PatientGraph events.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/reporting/patient_event.py`
  - `packages/deepsynaps-core/src/deepsynaps_core/timeline.py`
  - `packages/deepsynaps-core/migrations/*audio*.sql` if event kinds require DB
    migration
  - `tests/test_patient_event.py`
- **Internal/external dependencies:**
  - Internal: `PatientEvent`, `AudioVoiceReport`
  - External: existing deepsynaps-core package
- **Acceptance criteria:**
  - Adds `audio_analysis` event kind and `audio_analyzer` source where required.
  - `to_patient_event()` creates idempotent events with source version and
    payload.
  - Event payload contains report JSON and upstream linked events.
- **Tests required:**
  - Event construction test.
  - Idempotency key test.
  - Source/version propagation test.
- **Risk level:** Medium

### AUDIO-REP-004 — Render clinician HTML/PDF audio report

- **Priority:** P1
- **Goal:** Produce human-readable reports with task QC, acoustic features,
  profile scorecards, and longitudinal change charts.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/reporting/render.py`
  - `src/deepsynaps_audio/reporting/templates/audio_report.html`
  - `tests/test_render_report.py`
- **Internal/external dependencies:**
  - Internal: `AudioVoiceReport`
  - External: optional Jinja2/weasyprint/report renderer
- **Acceptance criteria:**
  - HTML report renders without optional PDF backend.
  - PDF rendering is optional and gracefully skipped if backend missing.
  - Report includes clinical-safety wording and limitations.
- **Tests required:**
  - HTML smoke render test.
  - Missing PDF backend skip test.
  - Forbidden diagnosis-language test.
- **Risk level:** Medium

### AUDIO-REP-005 — Implement longitudinal baseline resolver

- **Priority:** P0
- **Goal:** Select comparable baseline recordings for neuromodulation and
  progression tracking.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/workflow/baseline.py`
  - `tests/test_baseline_resolver.py`
- **Internal/external dependencies:**
  - Internal: report/session/task/QC schemas
  - External: storage/query adapter later; fake repository for unit tests
- **Acceptance criteria:**
  - `resolve_longitudinal_baseline()` filters by patient, task type, locale,
    device/context comparability, QC status, and recency.
  - Returns selected baseline set plus comparability notes.
  - Conservative when no comparable baseline exists.
- **Tests required:**
  - Comparable baseline selection test.
  - Device/context mismatch warning test.
  - No-baseline test.
- **Risk level:** Medium

---

## workflow_orchestration (audio-specific)

### AUDIO-WF-001 — Implement end-to-end audio pipeline orchestration

- **Priority:** P0
- **Goal:** Wire ingestion, QC, feature extraction, neurological analyzers,
  neuromodulation response, and reporting into one audio-specific pipeline.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/workflow/pipeline.py`
  - `src/deepsynaps_audio/workflow/provenance.py`
  - `tests/test_pipeline.py`
- **Internal/external dependencies:**
  - Internal: all P0 ingestion/features/analyzers/reporting modules
  - External: none required beyond optional feature backends
- **Acceptance criteria:**
  - `run_audio_pipeline()` accepts a session and task assets and returns an
    `AudioVoiceReport` or typed failure object.
  - Pipeline records feature-definition versions, backend versions, parameters,
    QC outcomes, and warnings.
  - Pipeline can run acoustic-only without ASR.
  - Side effects are isolated behind repository/writer interfaces.
- **Tests required:**
  - Synthetic end-to-end sustained vowel pipeline test.
  - Acoustic-only no-ASR test.
  - QC failure propagation test.
  - Provenance completeness test.
- **Risk level:** High

### AUDIO-WF-002 — Add audio-specific API and worker entrypoints

- **Priority:** P1
- **Goal:** Expose the audio pipeline to the application through typed API and
  async worker boundaries.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/api.py`
  - `src/deepsynaps_audio/worker.py`
  - `src/deepsynaps_audio/cli.py`
  - `portal_integration/api_contract.md`
  - `tests/test_api_contract.py`
- **Internal/external dependencies:**
  - Internal: `run_audio_pipeline()`, report schemas
  - External: optional FastAPI/Celery extras
- **Acceptance criteria:**
  - API/worker modules remain thin and do not contain DSP/business logic.
  - Defines endpoints/contracts for session creation, asset upload reference,
    pipeline start/status, and report retrieval.
  - CLI can run a local demo analysis for fixtures.
- **Tests required:**
  - API schema/contract tests.
  - Worker task smoke test with fake repository.
  - CLI help/import test.
- **Risk level:** Medium

### AUDIO-WF-003 — Implement provenance bundle builder

- **Priority:** P0
- **Goal:** Create a reusable provenance builder used by features, analyzers,
  and reports.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/workflow/provenance.py`
  - `tests/test_provenance.py`
- **Internal/external dependencies:**
  - Internal: schemas/constants
  - External: optional package version inspection
- **Acceptance criteria:**
  - Records pipeline version, feature-definition version, task battery version,
    backend names/versions, parameters, hashes, and QC decisions.
  - Redacts or avoids PHI-bearing fields.
  - Can merge child provenance entries from feature and analyzer steps.
- **Tests required:**
  - Bundle construction test.
  - PHI redaction/absence test.
  - Child provenance merge test.
- **Risk level:** Low

### AUDIO-WF-004 — Add backend/model registry configuration

- **Priority:** P1
- **Goal:** Provide explicit configuration for optional acoustic, ASR, and ML
  backends.
- **Files/directories likely to be created or modified:**
  - `src/deepsynaps_audio/workflow/config.py`
  - `src/deepsynaps_audio/backends/registry.py`
  - `src/deepsynaps_audio/models/registry.py`
  - `tests/test_backend_registry.py`
- **Internal/external dependencies:**
  - Internal: backend/model adapter interfaces
  - External: optional backend packages
- **Acceptance criteria:**
  - Registry selects backends by config, not hidden globals.
  - Missing optional backend errors are actionable.
  - Test configs can inject fake backends.
- **Tests required:**
  - Fake backend registration test.
  - Missing backend error test.
  - No hidden global state test.
- **Risk level:** Medium

---

## Recommended execution order for P0 tickets

1. **AUDIO-ING-001 — Scaffold audio package and core schemas**
2. **AUDIO-WF-003 — Implement provenance bundle builder**
3. **AUDIO-ING-004 — Define task battery manifests for clinical voice tasks**
4. **AUDIO-ING-002 — Implement audio asset import and metadata capture**
5. **AUDIO-ING-003 — Implement normalization for analysis copies**
6. **AUDIO-FEAT-001 — Implement acoustic backend adapter interfaces**
7. **AUDIO-FEAT-002 — Extract F0 and intensity features**
8. **AUDIO-FEAT-003 — Extract perturbation and voice-quality features**
9. **AUDIO-FEAT-004 — Extract cepstral, spectral, MFCC, and formant features**
10. **AUDIO-FEAT-005 — Implement timing, pause, and DDK feature extraction**
11. **AUDIO-NEURO-001 — Implement transparent PD voice profile scorecard**
12. **AUDIO-NEURO-002 — Implement dysarthria profile scorecard**
13. **AUDIO-REP-005 — Implement longitudinal baseline resolver**
14. **AUDIO-NEURO-004 — Implement neuromodulation response summaries**
15. **AUDIO-REP-001 — Build AudioVoiceReport assembly**
16. **AUDIO-REP-002 — Publish audio features to FeatureStore namespace**
17. **AUDIO-REP-003 — Add PatientGraph audio_analysis event bridge**
18. **AUDIO-WF-001 — Implement end-to-end audio pipeline orchestration**
