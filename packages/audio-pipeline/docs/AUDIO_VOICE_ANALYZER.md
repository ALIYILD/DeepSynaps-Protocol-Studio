# DeepSynaps Audio / Voice Analyzer — Target Specification

**Module:** `deepsynaps_audio`  
**Dashboard page:** Audio / Voice Analyzer (sidebar: **Biomarkers -> Voice**)  
**Status:** Product + architecture specification (v0.1.0)  
**Sibling modules:** `deepsynaps_qeeg`, `deepsynaps_mri`, DeepTwin voice encoder, PatientGraph, FeatureStore

---

## Executive summary

DeepSynaps Audio / Voice Analyzer should be a modular clinical decision-support
stack for short, repeatable voice tasks captured by phone, browser, or clinic
microphone. It is not primarily a dictation product. Its clinical value is in
extracting acoustic, speech, language, and longitudinal-change biomarkers that
can sit beside qEEG, MRI, PROMs, wearables, and neuromodulation session logs.

The v1 product should focus on neurological voice and speech workflows:

1. **Clinical voice tasks** for neurology and speech-language pathology (SLP):
   sustained vowel, reading passage, counting, diadochokinetic syllables
   (`pa-ta-ka`), and short free speech.
2. **Neuromodulation follow-up** for repeated voice assessments before and
   after TMS, tDCS, TPS, CES, tVNS, DBS/VNS programming, rehabilitation, and
   other stimulation workflows.
3. **Parkinson's / dysarthria / dystonia-oriented biomarkers** using validated
   acoustic families: F0, intensity, jitter, shimmer, HNR, formants, MFCCs,
   spectral features, nonlinear dynamics, prosody, articulation timing, and
   task-completion quality.
4. **Longitudinal tracking** that reports within-patient change from baseline,
   not a standalone diagnosis.

v2 should add deeper cognitive-speech and optional respiratory/cough workflows:

1. **Cognitive speech checks** for MCI/AD-spectrum risk support using speech
   rate, pause structure, lexical diversity, syntactic complexity, semantic
   coherence, word-finding markers, and task-specific narrative features.
2. **Respiratory/cough screening** using cough/breath segmentation, acoustic
   cough descriptors, breath timing, and optional risk-score models.
3. **Expanded telehealth flows** with guided prompts, repeatability coaching,
   caregiver-assisted tasks, and home-program adherence review.

All outputs should be explicitly labeled as **decision-support / biomarker
tracking**, require clinician review, include quality/provenance metadata, and
avoid autonomous diagnostic or treatment claims.

---

## 1. Main product use-cases

### 1.1 Clinical voice tasks

Short, structured recordings can be collected in clinic, during telehealth, or
as a remote home assessment:

| Task | Typical prompt | Primary signal |
|---|---|---|
| Sustained vowel | "Hold /a/ at comfortable pitch and loudness for 5 seconds." | Phonation stability: F0, jitter, shimmer, HNR, perturbation, voicing breaks |
| Reading passage | Standard paragraph or language-localized passage | Prosody, speech rate, articulation clarity, intensity, pauses, ASR-assisted transcript |
| Counting | Count 1-20 or 1-30 | Rhythm, timing, monotonicity, speech rate, intensity decay |
| DDK | Repeat `pa-ta-ka` quickly and clearly for 5-10 seconds | Alternating motion rate, articulation timing, dysarthria markers |
| Free speech | Describe a picture, daily routine, or health update | Paralinguistic, cognitive-linguistic, affective, and longitudinal change markers |

Target clinical users:

- neurologists monitoring Parkinson's disease, dystonia, dysarthria, stroke, TBI,
  DBS side effects, and post-stroke rehabilitation;
- SLPs tracking therapy progress and objective acoustic measures;
- remote-care clinicians needing low-friction assessments between visits.

### 1.2 Neuromodulation follow-up

Voice should be treated as a repeatable functional biomarker. A session bundle
can link a voice assessment to stimulation context:

```text
baseline voice task set
    -> neuromodulation session or programming change
    -> immediate post-session voice task set
    -> 24 h / 7 d remote follow-up task set
    -> longitudinal change report
```

DeepSynaps should compute:

- pre/post deltas for acoustic features and composite indices;
- reliable-change flags relative to within-patient baseline variability;
- adverse-effect signals such as new hypophonia, strained/hoarse voice, cough,
  breathiness, or speech-rate slowing after stimulation/programming;
- clinician-facing graphs aligned with stim parameters, PROMs, qEEG/MRI changes,
  and medication changes in PatientGraph.

### 1.3 Cognitive speech checks

For PD-MCI, MCI, and AD-spectrum decision support, structured language tasks can
produce longitudinal cognitive-linguistic features:

- picture description, story recall, category fluency, letter fluency, short
  conversational sample, and reading recall;
- pause burden, filled pauses, word-finding events, pronoun/noun ratio, lexical
  diversity, syntactic complexity, semantic coherence, information units, and
  topic drift;
- ASR confidence and transcript provenance, because poor ASR quality can mimic
  linguistic impairment.

These outputs should be framed as **risk/context signals**, not diagnosis.

### 1.4 Optional respiratory / cough screening

Voice-biomarker platforms popularized smartphone tests for cough, breath, and
phonation. DeepSynaps can optionally support:

- prompted cough samples, breath sounds, and sustained exhalation;
- cough segmentation and acoustic descriptors;
- breath timing and voice/breath coordination;
- risk-score outputs for respiratory review workflows.

This should remain v2 unless a clinical partner requires it sooner, because it
requires separate validation, consent language, and likely different labels.

---

## 2. Target module architecture

```text
phone / browser / clinic mic / uploaded wav
        |
        v
audio_ingestion/
  record, import, de-identify metadata, normalize, task manifest
        |
        v
audio_quality/
  SNR, clipping, reverberation, channel checks, speech present, task compliance
        |
        +-------------------------+
        |                         |
        v                         v
acoustic_feature_engine/     speech_linguistic_engine/
  F0, intensity, jitter,       VAD, ASR/transcript alignment,
  shimmer, HNR, formants,      speech rate, pauses, lexical,
  MFCCs, CPP, AVQI/DSI-like,   syntactic, semantic features
  nonlinear dynamics
        |                         |
        +------------+------------+
                     |
                     v
neurological_voice_analyzers/
  PD, dysarthria, dystonia, stroke/TBI-oriented composites,
  DDK/articulation timing, hypophonia, prosody, response-to-stim deltas
                     |
                     v
cognitive_speech_analyzers/        respiratory_voice_analyzer/ (v2)
  MCI/AD risk features,             cough/breath segmentation,
  narrative/task scores             respiratory acoustic features
                     |
                     v
workflow_orchestration/
  task batteries, longitudinal baselines, stim-session linkage,
  provenance, consent, retries, versioned model registry
                     |
                     v
reporting/
  clinician JSON, FeatureStore rows, PatientGraph event,
  trend plots, PDF/HTML report, DeepTwin voice embedding payload
```

### 2.1 `audio_ingestion` and `audio_quality`

Responsibilities:

- browser/mobile recording and uploaded WAV/FLAC/M4A/WebM support;
- sample-rate normalization, mono conversion, loudness normalization for
  analysis copies while retaining the immutable original;
- task manifests: prompt, language, device class, microphone route, setting
  (`clinic`, `telehealth`, `home`), and recording instructions;
- PHI-aware metadata stripping;
- quality gates: SNR, clipping, low volume, saturation, background speech,
  reverberation proxy, missing speech, too-short recording, wrong task duration,
  and repeatability warnings.

Recommended v1 libraries:

- `soundfile`, `librosa` or `torchaudio` for loading/resampling;
- `webrtcvad` or Silero VAD for speech activity;
- `noisereduce` or spectral SNR estimators for advisory QC;
- `praat-parselmouth` for Praat-compatible acoustic features where possible.

### 2.2 `acoustic_feature_engine`

Core SLP/neurological acoustic features:

- F0 mean, median, range, SD, coefficient of variation, slope, voiced fraction;
- intensity / loudness mean, range, decay, SPL-calibrated fields when available;
- jitter family, shimmer family, harmonic-to-noise ratio (HNR), noise-to-harmonic
  ratio (NHR), cepstral peak prominence (CPP);
- formants F1-F4, vowel-space area when enough vowel tokens exist;
- spectral centroid, rolloff, tilt, energy bands, MFCCs, delta MFCCs;
- AVQI/DSI-inspired composite feature groups, with "like" terminology until the
  exact proprietary/standard formulas and validation posture are confirmed;
- nonlinear PD feature families from research: RPDE, DFA, PPE-style pitch
  entropy, recurrence / perturbation summaries where validated.

### 2.3 `speech_linguistic_engine`

Runs when transcript or ASR output is available:

- ASR transcript, word timestamps, confidence, language, and diarization status;
- speech rate, articulation rate, pause count, pause duration distribution,
  phonation-time ratio, filled pauses;
- lexical diversity, type-token ratio variants, word frequency, pronoun/noun
  ratio, content-word density, repetitions, repairs;
- syntactic complexity: mean length of utterance, dependency depth, clause
  counts, grammatical fragments;
- semantic coherence and information units for structured tasks;
- transcript quality flags to prevent over-interpreting low-confidence ASR.

Whisper, Vosk, or another medical-ASR-compatible stack can be used, but ASR is a
supporting layer. The acoustic analysis must remain useful without transcripts.

### 2.4 `neurological_voice_analyzers`

Condition-oriented analyzers should combine task-specific features into
transparent scorecards:

- **PD speech profile:** hypophonia, monopitch, monoloudness, reduced stress,
  articulation-rate changes, DDK slowing/irregularity, jitter/shimmer/HNR,
  nonlinear phonation measures, and spectral/MFCC embeddings.
- **Dysarthria profile:** intelligibility proxies, articulation timing, vowel
  space, rate, pause burden, phonation stability, and prosodic control.
- **Dystonia / spasmodic dysphonia profile:** strained/strangled voice markers,
  voicing breaks, pitch/voice arrests, tremor proxies, task contrast between
  sustained vowel, reading, and connected speech.
- **Stroke/TBI profile:** speech rate, pause burden, prosody, articulation,
  cognitive-linguistic flags when transcript is available.
- **Neuromodulation response profile:** pre/post deltas and reliable-change
  flags, linked to stimulation modality, target, dose/session number, and
  medication state.

Outputs should be explainable: each composite score lists the top contributing
features, quality limitations, and whether the sample was comparable with prior
recordings.

### 2.5 `cognitive_speech_analyzers`

v2 analyzers for MCI/AD-spectrum and PD-MCI risk context:

- task-specific narrative scoring for picture description and story recall;
- pause and word-finding markers;
- semantic coherence and information density;
- lexical/syntactic complexity and simplification trajectories;
- longitudinal drift relative to personal baseline and age/language norms.

### 2.6 `respiratory_voice_analyzer`

Optional v2 module:

- cough/breath detection and segmentation;
- cough count, bout duration, spectral descriptors, explosive phase duration;
- breath timing, audible wheeze-like acoustic flags, sustained exhalation timing;
- risk-score wrappers with clear uncertainty and referral language.

### 2.7 `reporting` and longitudinal tracking

Reporting should produce:

- clinician JSON contract;
- patient-friendly summary where enabled;
- FeatureStore rows using namespaced feature names such as
  `audio.f0.mean_hz`, `audio.jitter.local_pct`, `audio.pd.hypophonia_score`;
- PatientGraph `audio_analysis` event;
- task-level QC panels and trend charts;
- neuromodulation pre/post comparison tiles;
- cited evidence links via MedRAG for the selected condition and biomarker set;
- exportable PDF/HTML report.

### 2.8 `workflow_orchestration` and provenance

Every analysis should record:

- pipeline version, model versions, ASR model version, feature definitions version;
- device and recording context;
- task prompt ID, language/locale, recording duration, sampling rate;
- QC decision and warnings;
- previous baseline used for comparison;
- linked `stim_session`, `protocol_generated`, medication, PROM, qEEG, and MRI
  event IDs where applicable;
- raw audio storage URI, derived-file URIs, transcript URI, and hash digests;
- clinician review status.

---

## 3. Functional ideas DeepSynaps should copy

### 3.1 From SLP tools

Copy the **workflow discipline** and **clinician-readable acoustic measures**:

- sustained-vowel and connected-speech task batteries;
- pitch, loudness, jitter, shimmer, HNR, CPP, spectrograms, formants, vowel space;
- AVQI/DSI-style composite voice-quality indices;
- therapy-progress tracking with session-to-session graphs;
- patient exercises and repeatable prompts;
- visual spectrogram/waveform review for SLPs;
- exportable reports with task-level quality flags.

Do not copy proprietary formulas blindly. Implement transparent analogues first,
then add validated exact calculations only where licensing and validation allow.

### 3.2 From PD voice biomarker work

Copy the **feature families and scoring paradigm**:

- perturbation measures: jitter, shimmer, HNR/NHR;
- nonlinear phonation features: RPDE, DFA, PPE/pitch entropy families;
- spectral and cepstral descriptors: MFCCs, delta MFCCs, spectral tilt, CPP;
- prosody: F0 variability, intensity variability, monotonicity, stress contrast;
- articulation: DDK rate/regularity, syllable timing, vowel-space reduction;
- classifier outputs as calibrated decision-support risk/context scores with
  confidence intervals and quality caveats;
- longitudinal within-patient change as a primary endpoint, especially around
  stimulation sessions and medication states.

### 3.3 From cognitive speech work

Copy the **language-feature schema**:

- speech rate, articulation rate, total pause time, mean pause duration, pause
  placement, filled pauses;
- lexical diversity, lexical frequency, content density, pronoun/noun ratio;
- syntactic complexity, clause density, dependency depth, utterance length;
- semantic coherence, information units, repetitions, repairs, circumlocution;
- task-specific normative comparisons only when language, education, and ASR
  quality are appropriate.

### 3.4 From voice biomarker platforms

Copy the **telehealth and risk-score mechanics**:

- low-friction smartphone tests with guided prompts and automatic QC;
- repeat/redo guidance when audio quality is poor;
- structured risk scores that separate signal quality, model confidence, and
  clinical interpretation;
- remote longitudinal trend dashboards;
- consent, privacy, and device metadata capture;
- clear "screening / monitoring / decision-support" framing.

---

## 4. Function table

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|---|---|---|---|---|---|
| `audio_ingestion` | `create_audio_session()` | Create a task-battery session and manifest | `patient_id`, task battery ID, locale, context, linked event IDs | `AudioSession` with task prompts and upload URLs | Telehealth voice platforms, DeepSynaps PatientGraph |
| `audio_ingestion` | `ingest_audio_file()` | Import phone/browser/clinic audio and store immutable original | file bytes/URI, manifest, user/session IDs | `AudioAsset` with hash, storage URI, metadata | SLP tools, voice biomarker platforms |
| `audio_ingestion` | `normalize_audio()` | Produce analysis-ready mono/resampled copy | `AudioAsset`, target sample rate, channel policy | normalized WAV/array + transform provenance | General audio DSP |
| `audio_ingestion` | `strip_audio_metadata()` | Remove nonessential metadata from derived files | audio file, retention policy | de-identified derived audio asset | Clinical privacy / PHI handling |
| `audio_quality` | `estimate_audio_quality()` | Compute recording quality and pass/warn/fail status | waveform, sample rate, task metadata | `AudioQualityReport` with SNR, clipping, volume, duration | Telehealth voice platforms |
| `audio_quality` | `detect_speech_activity()` | Identify voiced/speech intervals | waveform, sample rate | VAD segments, voiced fraction | ASR/VAD stack |
| `audio_quality` | `validate_task_compliance()` | Check task duration, speech presence, repeats, missing segments | VAD segments, prompt type, transcript optional | compliance status + remediation prompt | SLP task workflows |
| `audio_quality` | `compare_recording_conditions()` | Flag device/environment mismatch vs baseline | current QC, baseline QC/device metadata | comparability score and warnings | Longitudinal biomarker practice |
| `acoustic_feature_engine` | `extract_f0_features()` | Quantify pitch level and variability | waveform, sample rate, voiced segments | F0 summary, contour, confidence | SLP tools, PD biomarkers |
| `acoustic_feature_engine` | `extract_intensity_features()` | Quantify loudness, decay, variability | waveform, sample rate, calibration optional | intensity summary and contour | SLP tools, PD hypophonia tracking |
| `acoustic_feature_engine` | `extract_perturbation_features()` | Compute jitter/shimmer/HNR/NHR on stable phonation | sustained vowel waveform, F0 track | perturbation metrics + validity flags | SLP tools, PD biomarkers |
| `acoustic_feature_engine` | `extract_cepstral_features()` | Compute CPP, MFCCs, delta MFCCs, spectral descriptors | waveform, sample rate, segments | cepstral/spectral feature vector | PD biomarkers, dysarthria ML |
| `acoustic_feature_engine` | `extract_formant_features()` | Estimate formants and vowel-space proxies | waveform, sample rate, transcript/phoneme hints optional | F1-F4 summaries, vowel-space features | SLP tools, dysarthria analysis |
| `acoustic_feature_engine` | `extract_nonlinear_phonation_features()` | Compute RPDE/DFA/PPE-style features where valid | sustained vowel F0/period signal | nonlinear feature vector + validity flags | PD voice biomarker literature |
| `acoustic_feature_engine` | `compute_voice_quality_indices()` | Build AVQI/DSI-inspired transparent composites | acoustic features, task metadata | composite voice-quality scorecards | SLP tools |
| `speech_linguistic_engine` | `transcribe_audio()` | Generate transcript and word timestamps when enabled | audio asset, locale, ASR config | transcript, word timings, confidence | Medical ASR stack |
| `speech_linguistic_engine` | `align_transcript_to_audio()` | Align words/phones to audio for timing features | transcript, waveform, sample rate | aligned transcript with timing | ASR / forced alignment |
| `speech_linguistic_engine` | `extract_timing_features()` | Compute speech rate, articulation rate, pauses | VAD segments, aligned transcript optional | timing and pause feature set | Cognitive speech, PD prosody |
| `speech_linguistic_engine` | `extract_lexical_features()` | Compute lexical diversity and word-use markers | transcript, locale, task type | lexical feature set + quality flags | Cognitive speech biomarkers |
| `speech_linguistic_engine` | `extract_syntactic_features()` | Compute utterance/syntax complexity | transcript, parser config | syntactic feature set | Cognitive speech biomarkers |
| `speech_linguistic_engine` | `extract_semantic_features()` | Estimate coherence and information content | transcript, task rubric, embeddings optional | semantic coherence / information-unit scores | MCI/AD speech work |
| `neurological_voice_analyzers` | `score_pd_voice_profile()` | Produce PD-oriented speech/voice profile | acoustic + timing features, task QC | PD profile score, drivers, caveats | PD voice biomarkers |
| `neurological_voice_analyzers` | `score_dysarthria_profile()` | Summarize dysarthria-relevant feature pattern | acoustic, DDK, reading/free speech features | dysarthria profile score, drivers | Neurological voice AI, SLP |
| `neurological_voice_analyzers` | `score_dystonia_voice_profile()` | Flag strained/unstable phonation pattern for review | vowel + connected speech features | dystonia/spasmodic dysphonia profile | Neurological voice disorders |
| `neurological_voice_analyzers` | `analyze_ddk_task()` | Quantify alternating motion rate and regularity | DDK waveform, VAD/syllable detector | DDK rate, rhythm, breakdown flags | SLP neurological assessment |
| `neurological_voice_analyzers` | `compute_neuromodulation_response()` | Compare pre/post voice biomarkers around stimulation | baseline analysis, follow-up analysis, stim event | deltas, reliable-change flags, response summary | Neuromodulation tracking |
| `cognitive_speech_analyzers` | `score_mci_speech_profile()` | Produce cognitive-speech risk/context score | transcript features, timing features, task rubric | MCI/AD-context score, drivers, caveats | Cognitive speech biomarkers |
| `cognitive_speech_analyzers` | `analyze_picture_description()` | Score information units and coherence | transcript, picture/task rubric | task-specific language features | AD/MCI speech tasks |
| `cognitive_speech_analyzers` | `analyze_verbal_fluency()` | Score category/letter fluency tasks | transcript, task config, timings | count, repetitions, clusters, switches | Neuropsychology speech tasks |
| `respiratory_voice_analyzer` | `segment_cough_breath_events()` | Detect coughs, breaths, and sustained exhalation | waveform, sample rate | respiratory event segments | Respiratory voice platforms |
| `respiratory_voice_analyzer` | `extract_cough_features()` | Compute cough acoustic descriptors | cough segments, waveform | cough feature vector | Cough biomarker platforms |
| `respiratory_voice_analyzer` | `score_respiratory_voice_risk()` | Produce optional respiratory screening score | cough/breath features, QC | risk/context score and caveats | VoiceMed/Sonde-style platforms |
| `reporting` | `build_audio_report()` | Assemble clinician report payload | all features, analyzers, QC, provenance | `AudioVoiceReport` JSON | MRI/qEEG report pattern |
| `reporting` | `publish_audio_features()` | Write numeric features to FeatureStore | report, feature namespace config | FeatureStore rows | DeepSynaps feature bus |
| `reporting` | `to_patient_event()` | Emit append-only PatientGraph event | report, patient ID | `PatientEvent(kind=audio_analysis)` | DeepSynaps PatientGraph |
| `reporting` | `render_audio_report_html_pdf()` | Produce human-readable report | `AudioVoiceReport`, template config | HTML/PDF URIs | qEEG/MRI reporting |
| `workflow_orchestration` | `run_audio_pipeline()` | End-to-end orchestration for one session | session ID, assets, config | completed report or failure state | MRI/qEEG pipeline pattern |
| `workflow_orchestration` | `select_task_battery()` | Choose task battery by use-case | condition/use-case, locale, patient constraints | ordered task list | SLP/neurology assessment workflows |
| `workflow_orchestration` | `link_stim_context()` | Link voice session to stimulation or device programming | session, stim/protocol event IDs | enriched session context | Neuromodulation workflow |
| `workflow_orchestration` | `resolve_longitudinal_baseline()` | Select comparable baseline recordings | patient ID, task type, device/context filters | baseline set + comparability notes | Longitudinal biomarker practice |
| `workflow_orchestration` | `record_analysis_provenance()` | Persist hashes, model versions, configs, warnings | pipeline context | provenance bundle | Clinical audit / SaMD readiness |

---

## 5. MVP v1 vs v2

### MVP v1: neurological voice + neuromodulation response

Build first:

1. **Task batteries**
   - sustained vowel, reading passage, counting, DDK, and short free speech;
   - English-first task manifests with locale-ready prompt IDs.
2. **Audio ingest and QC**
   - upload/recording manifest, normalization, VAD, SNR/clipping/volume/duration,
     task-compliance warnings, and repeat prompt messaging.
3. **Acoustic features**
   - F0, intensity, jitter, shimmer, HNR/NHR, CPP, MFCCs, formants, spectral
     descriptors, DDK timing, pause/rate features.
4. **PD / dysarthria / dystonia-oriented analyzers**
   - transparent scorecards with drivers and caveats rather than opaque labels.
5. **Neuromodulation response tracking**
   - pre/post and longitudinal deltas linked to `stim_session` and protocol events.
6. **Reporting and integration**
   - `AudioVoiceReport` JSON, FeatureStore rows, PatientGraph event, PDF/HTML
     report, DeepTwin voice embedding payload.

Defer exact AVQI/DSI certification, disease classifiers with clinical claims,
and population normative models until validation data and regulatory posture are
clear. v1 can ship composite **research/wellness / decision-support** indices
with explicit feature definitions.

### v2: cognitive, respiratory, expanded task coverage

Add after the v1 measurement layer is stable:

1. cognitive-speech analyzers for picture description, story recall, category
   fluency, and PD-MCI/MCI/AD-spectrum risk context;
2. language-specific ASR quality handling and transcript feature normalization;
3. respiratory/cough/breath analyzer and optional risk-score wrappers;
4. richer normative models by age, sex, language, device type, and clinical
   cohort;
5. more advanced embeddings: wav2vec2/HuBERT/audio spectrogram models,
   transcript embeddings, and multimodal qEEG/MRI/audio fusion;
6. clinician labeling tools for active learning and model calibration.

---

## 6. Suggested JSON contract

```jsonc
{
  "analysis_id": "uuid",
  "pipeline_version": "0.1.0",
  "patient": {
    "patient_id": "patient_123",
    "age": 68,
    "sex": "F",
    "primary_language": "en"
  },
  "session": {
    "session_id": "uuid",
    "use_case": "neuromodulation_followup",
    "context": "telehealth",
    "linked_event_ids": ["stim_session_uuid"],
    "task_battery": "pd_neuromod_v1",
    "recorded_at": "2026-05-02T05:33:00Z"
  },
  "qc": {
    "overall_status": "pass",
    "warnings": ["background_noise_mild"],
    "snr_db": 24.1,
    "clipping_fraction": 0.0,
    "speech_present": true,
    "comparable_to_baseline": true
  },
  "tasks": [
    {
      "task_id": "sustained_vowel_a",
      "prompt_id": "en_sustain_a_5s",
      "duration_sec": 6.2,
      "qc_status": "pass",
      "features": {
        "f0_mean_hz": 178.4,
        "jitter_local_pct": 0.72,
        "shimmer_local_pct": 3.8,
        "hnr_db": 18.9,
        "cpp_db": 12.1
      }
    }
  ],
  "analyzers": {
    "pd_voice_profile": {
      "score": 0.42,
      "tier": "monitor",
      "top_drivers": ["reduced_f0_variability", "low_intensity_variability"],
      "limitations": ["single home microphone"]
    },
    "neuromodulation_response": {
      "baseline_analysis_id": "uuid",
      "delta_summary": {
        "intensity_mean_db_delta": 2.1,
        "ddk_rate_delta_pct": 4.5
      },
      "reliable_change_flags": []
    }
  },
  "provenance": {
    "audio_hash": "sha256:...",
    "model_versions": {
      "vad": "silero-vad-x.y",
      "asr": null,
      "feature_definitions": "audio_features_v0.1"
    },
    "created_by": "system"
  }
}
```

---

## 7. Proposed file / folder structure

```text
packages/audio-pipeline/
├── README.md
├── CLAUDE.md
├── pyproject.toml
├── docs/
│   └── AUDIO_VOICE_ANALYZER.md
├── src/
│   └── deepsynaps_audio/
│       ├── __init__.py
│       ├── schemas.py                    # AudioSession, AudioAsset, AudioVoiceReport
│       ├── constants.py                  # task IDs, feature names, thresholds
│       ├── ingestion/
│       │   ├── __init__.py
│       │   ├── io.py                     # read/import audio files
│       │   ├── normalize.py              # resample, mono, loudness normalization
│       │   └── metadata.py               # hashes, storage refs, metadata stripping
│       ├── quality/
│       │   ├── __init__.py
│       │   ├── vad.py                    # voice activity detection
│       │   ├── qc.py                     # SNR, clipping, duration, compliance
│       │   └── comparability.py          # baseline/device/environment matching
│       ├── features/
│       │   ├── __init__.py
│       │   ├── acoustic.py               # F0, intensity, CPP, spectral
│       │   ├── perturbation.py           # jitter, shimmer, HNR/NHR
│       │   ├── formants.py               # F1-F4, vowel-space features
│       │   ├── cepstral.py               # MFCCs, delta MFCCs
│       │   ├── nonlinear.py              # RPDE/DFA/PPE-style families
│       │   └── timing.py                 # pauses, speech rate, DDK timing
│       ├── speech/
│       │   ├── __init__.py
│       │   ├── asr.py                    # Whisper/Vosk adapters
│       │   ├── alignment.py              # word/phone alignment
│       │   ├── lexical.py                # lexical diversity/content features
│       │   ├── syntax.py                 # syntactic complexity
│       │   └── semantics.py              # coherence/information units
│       ├── analyzers/
│       │   ├── __init__.py
│       │   ├── neurological.py           # PD/dysarthria/dystonia/stroke profiles
│       │   ├── neuromodulation.py        # pre/post reliable-change summaries
│       │   ├── cognitive.py              # v2 MCI/AD speech profiles
│       │   └── respiratory.py            # v2 cough/breath profiles
│       ├── workflow/
│       │   ├── __init__.py
│       │   ├── task_batteries.py         # clinical task selection
│       │   ├── baseline.py               # longitudinal baseline resolver
│       │   ├── provenance.py             # model/config/hash bundle
│       │   └── pipeline.py               # run_audio_pipeline()
│       ├── reporting/
│       │   ├── __init__.py
│       │   ├── report.py                 # JSON report assembly
│       │   ├── render.py                 # HTML/PDF
│       │   ├── feature_store.py          # FeatureStore publishing
│       │   └── patient_event.py          # PatientGraph bridge
│       ├── api.py                        # FastAPI router
│       ├── worker.py                     # Celery task queue
│       └── cli.py                        # ds-audio entrypoint
├── medrag_extensions/
│   └── 00_audio_entities.sql             # voice biomarker entities/relations
├── portal_integration/
│   ├── DASHBOARD_PAGE_SPEC.md
│   └── api_contract.md
├── demo/
│   ├── sample_audio_report.json
│   └── demo_end_to_end.py
└── tests/
    ├── fixtures/
    ├── test_quality.py
    ├── test_acoustic_features.py
    ├── test_neurological_profiles.py
    └── test_report_contract.py
```

Core integration note: `deepsynaps_core.timeline.EventKind` and `Source` will
need a new `audio_analysis` / `audio_analyzer` pair before reports can be
published into PatientGraph.

---

## 8. Recommended first 5 implementation tasks for agents

1. **Create the package scaffold and schemas**
   - Add `packages/audio-pipeline/pyproject.toml`, `src/deepsynaps_audio`, and
     Pydantic/dataclass models for `AudioSession`, `AudioAsset`,
     `AudioQualityReport`, `TaskFeatureSet`, `AnalyzerScore`, and
     `AudioVoiceReport`.
2. **Implement ingest, normalization, and QC**
   - Load WAV/FLAC/M4A/WebM, resample to a configured rate, convert to mono,
     compute hashes, estimate SNR/clipping/volume/duration, run VAD, and return
     pass/warn/fail quality reports with tests using synthetic audio fixtures.
3. **Implement v1 acoustic feature extraction**
   - Add Praat-compatible F0, intensity, jitter, shimmer, HNR, CPP/MFCC,
     formant, and DDK timing functions with validity flags and unit tests.
4. **Build neurological + neuromodulation report path**
   - Implement transparent PD/dysarthria/dystonia scorecards and
     `compute_neuromodulation_response()` using baseline/follow-up deltas.
5. **Wire DeepSynaps integration**
   - Add PatientGraph `audio_analysis` event support, FeatureStore audio feature
     publishing, API route, worker task, sample report JSON, and dashboard contract.

---

## 9. Non-negotiables

- Do not persist raw audio outside patient-scoped storage.
- Do not present analyzer outputs as autonomous diagnoses.
- Always show task-level QC and comparability warnings before interpreting change.
- Version every model, feature definition, prompt, task battery, and report.
- Separate acoustic features from ASR-derived linguistic features so poor ASR
  cannot corrupt voice biomarker reporting.
- Link neuromodulation interpretations to explicit upstream `stim_session`,
  protocol, medication, and PROM events whenever available.
