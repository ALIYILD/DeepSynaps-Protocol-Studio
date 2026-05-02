# DeepSynaps Studio — Audio / Voice Analyzer Stack

**Goal:** clinicians, SLPs, and remote patients submit short voice
recordings (sustained vowel, reading passage, counting, DDK, free
speech, optional cough/breath) → portal returns a clinical-grade voice
report (acoustic indices, AVQI/DSI-like global scores, neurological
voice biomarkers, speech-linguistic features, longitudinal tracking,
optional cognitive and respiratory risk scores) and a JSON payload that
plugs into the same MedRAG hypergraph used by the qEEG and MRI
analyzers.

This is the sibling module to `deepsynaps_qeeg` and `deepsynaps_mri`.
It is the **Voice Analyzer** page in the DeepSynaps Studio sidebar.

---

## 1. Executive summary

DeepSynaps already has modular qEEG and MRI/fMRI analyzers wired into a
shared MedRAG retrieval layer over the 87k-paper DeepSynaps corpus.
Voice/speech is the third clinically-validated input modality the
roadmap calls for, because:

- vocal biomarkers are cheap, repeatable, telehealth-friendly, and
  sensitive to neurological state changes (Parkinson’s, dystonia,
  dysarthria, stroke/TBI recovery, MCI/AD spectrum);
- they pair naturally with neuromodulation workflows (TMS, tDCS, TPS,
  CES, tVNS) — the same patient can be measured pre- and
  post-stimulation in minutes;
- the SLP / clinical-voice-analysis ecosystem (Voice Analyst, PhonaLab,
  OperaVOX, Phonalyze, Vocametrix) and the consumer voice-biomarker
  platforms (VoiceMed, Sonde-style risk scores) have already proven
  both the math and the UX patterns; we re-implement the open-science
  feature stack on top of `parselmouth` / `librosa` and surface it in
  the same DeepSynaps clinical dashboard.

**Scope of this module (what it ships):**

1. **Clinical voice tasks.** Short structured smartphone or in-clinic
   recordings: sustained `/a/`, reading passage (e.g. Rainbow / CAPE-V
   sentences), counting 1–20, DDK (`/pa-ta-ka/`), free speech / picture
   description, optional cough / breath sound.
2. **Neuromodulation follow-up.** Repeatable longitudinal voice
   assessments before and after TMS / tDCS / TPS / CES / tVNS, with
   delta and effect-size scoring against the patient’s own baseline.
3. **Cognitive speech checks.** Picture-description / verbal-fluency
   tasks producing prosodic, lexical, and syntactic features that map
   onto MCI / AD-spectrum risk indicators.
4. **Optional respiratory / cough screen.** Cough and breath-sound
   features for triaging respiratory state during a neuro visit
   (asthma, post-COVID, ALS bulbar progression).

**What this module is NOT:**

- It is not a medical-grade dictation / EHR transcription product. ASR
  is used only when transcripts are needed for linguistic features;
  Whisper/Vosk are wrapped behind a single `transcription.py` adapter
  with a clear "research / wellness" label.
- It is not a diagnostic device. All outputs are labelled
  research/wellness until CE Class IIa (or equivalent) is secured, in
  line with `packages/qeeg-pipeline/CLAUDE.md` and
  `packages/mri-pipeline/CLAUDE.md`.

---

## 2. TL;DR — the recommended stack

| Layer | Library | License | Why |
|---|---|---|---|
| **Core audio I/O + DSP** | `soundfile`, `librosa`, `numpy`, `scipy` | BSD / ISC | Standard Python audio stack; reads WAV / FLAC / OGG / MP3 (via ffmpeg), provides MFCC / spectrogram / pitch baseline. |
| **Phonetic / clinical acoustics** | **Parselmouth (Praat in Python)** | GPL-3 (linked dynamically) | Praat is the *de-facto* standard for voice research: pitch, jitter, shimmer, HNR, formants, intensity, spectrum, voice report. Parselmouth gives a Pythonic API. ([parselmouth docs](https://parselmouth.readthedocs.io/), [Praat](https://www.fon.hum.uva.nl/praat/)) |
| **Voice-specific feature sets** | **openSMILE (eGeMAPS / ComParE)** + **DisVoice** | Apache-2.0 / MIT | eGeMAPS is the standardised minimal voice biomarker set used in both clinical and consumer voice biomarker work; DisVoice ships PD-specific feature extractors (phonation, articulation, prosody, glottal). ([eGeMAPS paper](https://ieeexplore.ieee.org/document/7160715), [DisVoice](https://github.com/jcvasquezc/DisVoice)) |
| **Voice quality (AVQI / DSI primitives)** | derived in `clinical_indices.py` | — | Re-implements the published AVQI-v3 / DSI formulas on top of Parselmouth measurements (CPPS, HNR, slope of LTAS, shimmer, jitter, F0). ([AVQI overview](https://pubmed.ncbi.nlm.nih.gov/31320252/)) |
| **ASR (optional, for linguistic features)** | **faster-whisper** (CPU/GPU), **vosk** (offline fallback) | MIT / Apache-2.0 | Whisper is the strongest open ASR; vosk is the lightweight offline path for low-bandwidth telehealth. Wrapped behind a single adapter so the analyzer never hard-depends on either. ([faster-whisper](https://github.com/SYSTRAN/faster-whisper), [vosk](https://alphacephei.com/vosk/)) |
| **Linguistic / NLP features** | `spacy`, `nltk`, `textstat`, optional **CLAN/CHAT** parser | MIT | Lexical diversity (TTR, MTLD, Brunet's W), syntactic complexity, idea-density, noun/verb ratios — the cognitive-speech feature set used in the AD/MCI literature ([cognitive speech review](https://pubmed.ncbi.nlm.nih.gov/35187032/)). |
| **PD-/dysarthria-oriented feature stacks** | DisVoice + custom RPDE / DFA / PPE | MIT | Recursive period-density entropy, detrended fluctuation analysis, and pitch-period entropy are the canonical Parkinson’s telemonitoring features (Tsanas, Little). Implemented in `neurological/parkinson.py`. ([Tsanas 2010](https://pubmed.ncbi.nlm.nih.gov/20142049/)) |
| **Respiratory / cough analysis** | `librosa` + `pyAudioAnalysis` + `panns_inference` | Apache-2.0 / MIT | Cough segmentation, breath-cycle detection, spectral envelope features. PANNs CNN for "is this a cough / breath / speech" detection. ([pyAudioAnalysis](https://github.com/tyiannak/pyAudioAnalysis), [PANNs](https://github.com/qiuqiangkong/audioset_tagging_cnn)) |
| **Quality control** | `pyloudnorm` (LUFS), `webrtcvad` (VAD), in-house SNR + clipping detector | MIT / BSD | Telehealth recordings are often clipped, noisy, or multi-speaker. QC fails fast and surfaces actionable "re-record" reasons in the UI. ([pyloudnorm](https://github.com/csteinmetz1/pyloudnorm), [webrtcvad](https://github.com/wiseman/py-webrtcvad)) |
| **Normative database** | hybrid: own pooled norms (Saarbrücken, VOICED, Mozilla CV-derived demographics) + optional commercial license | — | Same path as the qEEG analyzer: ship age/sex-binned norms from open datasets v1; offer NeuroVoix / commercial DB OEM in v2. ([Saarbrücken Voice Database](http://www.stimmdatenbank.coli.uni-saarland.de/), [VOICED](https://physionet.org/content/voiced/1.0.0/)) |
| **Reporting + RAG** | Jinja2 + WeasyPrint + shared MedRAG layer | — | Same architecture as MRI/qEEG: structured JSON → Jinja → HTML/PDF, with citations resolved through MedRAG against the 87k-paper Postgres DB. |
| **Workflow + provenance** | FastAPI + Celery + shared `audio_analyses` Postgres table | — | Mirrors `qeeg_analyses` and `mri_analyses` so the portal can show a unified longitudinal timeline per patient. |

**Bottom line:** build on Parselmouth (Praat) + openSMILE (eGeMAPS) +
DisVoice. These three cover ~95 % of the published voice biomarker
literature; everything else is feature engineering on top.

---

## 3. Use-cases (inferred and ranked)

| # | Use-case | Tasks recorded | Primary outputs | MVP? |
|---|---|---|---|---|
| 1 | **Neuromodulation follow-up** (TMS / tDCS / TPS / CES / tVNS) | sustained `/a/` + reading passage + counting + DDK | per-session vector of acoustic + speech-rate features; baseline-normalised deltas; effect-size charts | **v1** |
| 2 | **Parkinson’s / dysarthria neurological voice** | sustained `/a/`, DDK `/pa-ta-ka/`, reading passage | jitter, shimmer, HNR, RPDE, DFA, PPE, MFCC summary, DDK rate/regularity, dysarthria severity score, PD-likelihood index | **v1** |
| 3 | **SLP voice-quality follow-up** | sustained `/a/`, CAPE-V sentences | AVQI-v3 score, DSI-like score, GRBAS estimator, LTAS slope, CPPS | **v1** |
| 4 | **Telehealth voice intake** | smartphone single-tap recording, structured prompts | QC status + auto-routed downstream analyzer, low-bandwidth-safe | **v1** |
| 5 | **Stroke / TBI bulbar follow-up** | sustained `/a/`, DDK, reading | dysarthria severity, DDK irregularity, voice-onset-time, intelligibility proxy | **v2** |
| 6 | **Cognitive speech check (PD-MCI / AD spectrum)** | picture description, verbal fluency, semantic categories | speech rate, pause statistics, lexical diversity, syntactic complexity, idea density, MCI risk index | **v2** |
| 7 | **Laryngeal dystonia tracking** | sustained `/a/`, sentence loaded with voiced/voiceless contrasts | voice break rate, jitter, breathiness vs strain index, response-to-Botox tracker | **v2** |
| 8 | **Respiratory / cough screen** | voluntary cough, deep breath, sustained `/a/` | cough count + class, breath-cycle stats, spectral cough features, respiratory risk score | **v2** |

---

## 4. Module architecture

```
                ┌────────────────────────────────────────────┐
                │  PORTAL  (Next.js voice page)              │
                │  - guided recorder (sustained /a/, DDK,    │
                │    reading, free speech, cough)            │
                │  - device picker, level meter, QC hint     │
                └────────────────┬───────────────────────────┘
                                 │  signed S3 upload
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  audio_ingestion                                                 │
│   - read WAV/FLAC/MP3/OGG/M4A via soundfile + ffmpeg             │
│   - resample to 16 kHz (speech) / 44.1 kHz (singing/voice qual.) │
│   - de-identify metadata, hash file, write BIDS-Audio derivative │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  quality_control                                                 │
│   - LUFS loudness (pyloudnorm), peak / clipping check            │
│   - SNR estimate (silence vs voiced segments)                    │
│   - VAD (webrtcvad) → speech / silence ratio                     │
│   - microphone-class fingerprint (smartphone vs studio)          │
│   - QC verdict: pass / warn / re-record (with reasons)           │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  acoustic_feature_engine                                         │
│   - F0 contour, mean / SD / range (Praat autocorrelation)        │
│   - jitter (local, RAP, PPQ5), shimmer (local, APQ3, APQ5,       │
│     APQ11), HNR, NHR                                             │
│   - CPPS, LTAS slope (1-10 kHz tilt)                             │
│   - formants F1–F4, formant dispersion, vowel space area         │
│   - MFCCs (13) + Δ + ΔΔ, summary stats                           │
│   - eGeMAPS / ComParE feature sets via openSMILE                 │
│   - intensity dynamics (mean / SD / max / dynamic range)         │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  clinical_indices                                                │
│   - AVQI-v3 (Acoustic Voice Quality Index, 7-feature regression) │
│   - DSI-like Dysphonia Severity Index                            │
│   - GRBAS auto-estimator (Grade / Roughness / Breathiness /      │
│     Asthenia / Strain) via small CNN on log-mel                  │
│   - voice break rate, voice break ratio                          │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  speech_linguistic_engine  (only when transcript is needed)      │
│   - faster-whisper / vosk adapter                                │
│   - speech rate (WPM, syllables-per-second)                      │
│   - pause statistics: count, mean / SD pause length, pause-time  │
│     ratio, hesitation markers                                    │
│   - lexical diversity (TTR, MTLD, Brunet's W, Honoré's R)        │
│   - syntactic complexity (mean length of utterance, Yngve depth) │
│   - idea density (Kintsch-style propositional density)           │
│   - language detection + per-language adapter                    │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌────────────────────────────┬─────────────────────────────────────┐
│ neurological_voice_analyzers │ cognitive_speech_analyzers       │
│ (PD, dysarthria, dystonia,   │ (MCI / AD spectrum)              │
│  stroke / TBI bulbar)        │ - prosodic + lexical + syntactic │
│ - DDK rate, DDK regularity   │   feature vector                 │
│ - RPDE, DFA, PPE             │ - MCI risk score (logistic /     │
│ - dysarthria severity model  │   gradient-boosted classifier)   │
│ - PD-voice likelihood (RF /  │ - per-task subscores             │
│   GBM on Tsanas feature set) │ - longitudinal cognitive index   │
│ - voice break / strain index │                                  │
└────────────────┬─────────────┴────────────────┬─────────────────┘
                 │                              │
                 ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ respiratory_voice_analyzer (optional)                            │
│   - cough/breath segmentation (PANNs + threshold)                │
│   - cough count, mean cough power, cough type (wet/dry)          │
│   - breath-cycle rate, inspiration:expiration ratio              │
│   - respiratory acoustic risk score                              │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ normative + longitudinal                                         │
│   - age / sex / language-binned z-scores                         │
│   - patient-as-own-baseline delta tracking (pre/post stim)       │
│   - effect-size + minimum-detectable-change calculators          │
│   - timeline JSON shared with qEEG + MRI analyzers               │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ reporting + RAG                                                  │
│   - structured features → JSON                                   │
│   - MedRAG over 87k-paper Postgres → cited findings              │
│   - Jinja2 → HTML → WeasyPrint PDF (clinical) +                  │
│     interactive HTML (waveform, spectrogram, F0 contour, deltas) │
└────────────────┬─────────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ workflow + provenance                                            │
│   - FastAPI endpoints, Celery worker                             │
│   - audio_analyses Postgres table (mirrors qeeg_analyses)        │
│   - pipeline_version + model_version stamped on every record     │
│   - file hash + recorder fingerprint for chain-of-custody        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. What we copy from each reference ecosystem

### From clinical SLP voice tools (Voice Analyst, PhonaLab, OperaVOX, Phonalyze, Vocametrix)

- **Acoustic indices:** F0 mean / SD / min / max / range, jitter (local
  + RAP + PPQ5), shimmer (local + APQ3 / 5 / 11), HNR, NHR, intensity,
  CPPS, LTAS slope, voice break rate.
- **Composite scores:** AVQI-v3 and a DSI-like dysphonia severity
  index, plus an auto-GRBAS estimator. These are the exact composites
  patients and SLPs already understand.
- **Workflow patterns:** session-based "voice diary" with
  protocol-locked tasks (sustained `/a/`, CAPE-V sentences, reading
  passage), pre/post therapy comparison, plain-language progress
  charts.
- **UX:** in-app guided recording with a real-time level meter and a
  "your recording is too quiet / too noisy / too short" QC overlay
  before submission.

### From PD voice biomarker work (Tsanas, Little, et al.)

- **Feature set:** jitter (5 variants), shimmer (6 variants), HNR, NHR,
  RPDE, DFA, PPE, plus MFCCs and TQWT-style sub-bands. Treat as one
  PD-feature pack used by both the supervised PD-likelihood model and
  the longitudinal "voice age" tracker.
- **Scoring paradigm:** report a continuous PD-voice likelihood (0–1)
  *and* the underlying biomarker percentiles, never a hard
  classification. This matches the regulatory posture and the Tsanas
  telemonitoring paradigm of UPDRS-III estimation.
- **DDK analysis:** syllable rate (`/pa/`, `/ta/`, `/ka/`), rate
  variability, voice onset time. Report alongside sustained-vowel
  features.

### From speech & language biomarkers for cognitive disease

- **Prosodic features:** speech rate, articulation rate, pause count
  and duration distribution, voiced/unvoiced ratio.
- **Lexical features:** TTR, MTLD, Brunet's W, Honoré's R,
  noun/verb/pronoun ratios, idea density.
- **Syntactic features:** mean length of utterance, Yngve depth, depth
  of embedded clauses.
- **Scoring paradigm:** per-task subscores (picture description,
  semantic fluency, phonemic fluency) feeding into a single MCI risk
  index that is reported as percentile relative to age-matched norms,
  not as a class label.

### From vocal biomarker platforms (VoiceMed, Sonde-style)

- **Smartphone-first telehealth flow:** single-tap recording → cloud QC
  → cloud feature extraction → risk-score JSON for the portal.
- **Risk-score structure:** every model output ships as
  `{score, percentile, drivers[], confidence, model_version, evidence_uris[]}`
  so the front-end can show the same "what drove this score" breakdown
  for every condition.
- **Cough / breath path:** simple opt-in "respiratory check" task that
  reuses the same recorder and sits next to the voice tasks.

### From medical ASR work

- ASR is **not** a deliverable here — it is a dependency. Whisper /
  vosk are wrapped behind one `transcription.py` adapter so the
  linguistic engine can be swapped without touching downstream
  analyzers. We never ship raw ASR text to the EHR from this module.

---

## 6. Function table

| Module | Function / API | Purpose | Inputs | Outputs | Inspiration |
|---|---|---|---|---|---|
| `audio_ingestion` | `load_recording(path, target_sr=16000) -> Recording` | normalise file → mono float32 + metadata | path, target sample rate | `Recording` (waveform, sr, duration_s, channels, meta) | librosa / soundfile, BIDS-Audio |
| `audio_ingestion` | `import_session(files, task_protocol) -> Session` | bundle multiple task takes into a clinical session | list of files, task protocol id | `Session` (per-task `Recording` map, patient_id, session_id) | SLP session pattern (Voice Analyst) |
| `audio_ingestion` | `to_bids(session, root) -> Path` | write BIDS-Audio derivative | session, output root | path to BIDS folder | BIDS-Audio standard |
| `quality_control` | `compute_qc(recording) -> QCReport` | LUFS, SNR, clipping, VAD speech ratio, mic class | `Recording` | `QCReport` (lufs, snr_db, clip_pct, speech_ratio, verdict, reasons) | telehealth recorders (Sonde / VoiceMed) |
| `quality_control` | `gate(qc) -> bool` | pass/fail gate before downstream features | `QCReport` | bool + reason list | clinical voice apps |
| `acoustic_feature_engine` | `extract_pitch(rec) -> PitchSummary` | F0 contour + mean/SD/range/min/max | `Recording` | `PitchSummary` | Praat / Parselmouth |
| `acoustic_feature_engine` | `extract_perturbation(rec) -> PerturbationFeatures` | jitter (local/RAP/PPQ5), shimmer (local/APQ3/5/11), HNR, NHR | `Recording` (sustained vowel) | dataclass of perturbation features | Praat voice report |
| `acoustic_feature_engine` | `extract_spectral(rec) -> SpectralFeatures` | CPPS, LTAS slope, spectral tilt, centroid | `Recording` | `SpectralFeatures` | OperaVOX / Phonalyze |
| `acoustic_feature_engine` | `extract_formants(rec, n=4) -> FormantFeatures` | F1–F4, vowel space area, formant dispersion | `Recording` (vowel) | `FormantFeatures` | Praat |
| `acoustic_feature_engine` | `extract_mfcc(rec, n=13) -> MFCCSummary` | MFCC + Δ + ΔΔ summary stats | `Recording` | `MFCCSummary` | librosa |
| `acoustic_feature_engine` | `extract_egemaps(rec) -> EGeMAPSVector` | standardised eGeMAPS vector | `Recording` | 88-d feature vector | openSMILE / eGeMAPS |
| `clinical_indices` | `compute_avqi(rec_vowel, rec_speech) -> AVQIScore` | AVQI-v3 acoustic voice quality index | sustained vowel + connected speech | `AVQIScore` (value, severity_band, sub-features) | AVQI literature |
| `clinical_indices` | `compute_dsi(rec) -> DSIScore` | DSI-like dysphonia severity index | recordings | `DSIScore` (value, band) | DSI literature |
| `clinical_indices` | `estimate_grbas(rec) -> GRBASScore` | auto GRBAS estimator (small CNN on log-mel) | sustained vowel | per-letter scores 0–3 + confidence | clinical voice apps |
| `clinical_indices` | `voice_break_metrics(rec) -> VoiceBreakStats` | voice break rate / ratio / longest break | sustained vowel | dataclass | Praat |
| `speech_linguistic_engine` | `transcribe(rec, language="en") -> Transcript` | ASR (whisper / vosk) — feature use only | `Recording`, language | `Transcript` (segments, words, timestamps, confidence) | faster-whisper / vosk |
| `speech_linguistic_engine` | `prosody_from_transcript(rec, transcript) -> ProsodyFeatures` | speech rate, pause stats, hesitation markers | `Recording`, `Transcript` | `ProsodyFeatures` | cognitive-speech literature |
| `speech_linguistic_engine` | `lexical_features(transcript) -> LexicalFeatures` | TTR, MTLD, Brunet's W, Honoré's R, POS ratios | `Transcript` | `LexicalFeatures` | AD/MCI speech literature |
| `speech_linguistic_engine` | `syntactic_features(transcript) -> SyntacticFeatures` | MLU, Yngve depth, embedded-clause depth | `Transcript` | `SyntacticFeatures` | AD/MCI speech literature |
| `neurological_voice_analyzers` | `pd_voice_likelihood(features) -> PDLikelihood` | continuous PD-voice likelihood + drivers | feature dict (acoustic + DDK + nonlinear) | `PDLikelihood` (score, percentile, drivers, model_version) | Tsanas / Little |
| `neurological_voice_analyzers` | `dysarthria_severity(features) -> DysarthriaScore` | severity 0–4 + subtype hint (spastic / flaccid / ataxic / hyperkinetic / hypokinetic) | features | `DysarthriaScore` | neurological voice AI reviews |
| `neurological_voice_analyzers` | `ddk_metrics(rec_ddk) -> DDKMetrics` | syllable rate, regularity, voice onset time | DDK recording | `DDKMetrics` | PD / dysarthria literature |
| `neurological_voice_analyzers` | `dystonia_voice_index(features) -> DystoniaIndex` | voice-break + strain + breathiness composite | features | `DystoniaIndex` | laryngeal dystonia AI work |
| `neurological_voice_analyzers` | `nonlinear_features(rec) -> NonlinearFeatures` | RPDE, DFA, PPE | sustained vowel | dataclass | Tsanas / Little |
| `cognitive_speech_analyzers` | `mci_risk_score(features) -> MCIRisk` | MCI / AD-spectrum risk + percentile | prosodic + lexical + syntactic features | `MCIRisk` (score, percentile, drivers, confidence) | AD/MCI speech literature |
| `cognitive_speech_analyzers` | `task_subscores(session) -> dict[task -> Subscore]` | per-task cognitive subscores | full session | dict | cognitive batteries |
| `respiratory_voice_analyzer` | `detect_cough(rec) -> CoughEvents` | cough segmentation + count + class | `Recording` | list of `CoughEvent` | pyAudioAnalysis / PANNs |
| `respiratory_voice_analyzer` | `breath_cycle_metrics(rec) -> BreathStats` | inspiration:expiration, breath rate | `Recording` (breath task) | `BreathStats` | respiratory voice biomarkers |
| `respiratory_voice_analyzer` | `respiratory_risk(features) -> RespRisk` | composite respiratory acoustic risk | features | `RespRisk` | VoiceMed-style risk score |
| `normative` | `zscore(feature_value, age, sex, language) -> ZScore` | demographic-binned z-score | value + demographics | `ZScore` (z, percentile, n_in_bin, bin_id) | qEEG normative pattern |
| `normative` | `delta_vs_baseline(current, baseline) -> Delta` | patient-as-own-baseline delta | current + baseline session features | `Delta` (raw, pct, effect_size, mdc_flag) | neuromodulation tracking |
| `longitudinal` | `timeline(patient_id) -> Timeline` | aggregate sessions over time | patient id | `Timeline` (sessions, key features, deltas) | qEEG longitudinal |
| `reporting` | `generate_report(session, features, indices, scores) -> ReportBundle` | structured features → HTML/PDF + JSON | full result objects | `ReportBundle` (json, html_path, pdf_path) | MRI/qEEG report pattern |
| `reporting` | `medrag_evidence(condition, drivers) -> Citations` | RAG over 87k-paper DB for cited findings | condition tag, top drivers | list of `Citation` | shared MedRAG layer |
| `workflow_orchestration` | `run_full_pipeline(session) -> ReportBundle` | end-to-end orchestrator | `Session` | `ReportBundle` | MRI/qEEG `pipeline.py` |
| `workflow_orchestration` | `enqueue(session) -> JobId` | submit to Celery queue | `Session` | job id | MRI/qEEG worker pattern |
| `workflow_orchestration` | `get_status(job_id) -> JobStatus` | poll job status | job id | enum + last-stage | MRI/qEEG worker pattern |
| `provenance` | `audit_record(session, bundle) -> AuditRow` | persist row in `audio_analyses` with hashes + versions | session, bundle | DB row | MRI/qEEG db.py |
| `api` | `POST /audio/upload` | start a session, return signed URLs | session metadata | upload URLs + session_id | shared portal API |
| `api` | `POST /audio/sessions/{id}/analyze` | enqueue analysis | session id | job id | shared portal API |
| `api` | `GET /audio/sessions/{id}/report` | fetch HTML/PDF/JSON | session id | report bundle | shared portal API |
| `api` | `GET /patients/{id}/audio/timeline` | longitudinal view | patient id | `Timeline` | shared portal API |

---

## 7. MVP v1 vs v2

### MVP v1 — neuromodulation + PD/neurological voice

Targets the two highest-value clinical scenarios that are already
funded by the platform: pre/post-stim follow-up and PD/dysarthria
tracking.

Modules included in v1:
- `audio_ingestion` (full)
- `quality_control` (full — gating is non-negotiable for telehealth)
- `acoustic_feature_engine`: pitch, perturbation, spectral, formants,
  MFCC. eGeMAPS *optional* (behind an extra) — we ship a Praat-only
  path that works without openSMILE.
- `clinical_indices`: AVQI-v3, voice break metrics. (DSI + auto-GRBAS
  shipped as preview behind a feature flag.)
- `neurological_voice_analyzers`: DDK metrics, nonlinear features
  (RPDE / DFA / PPE), PD-voice likelihood, dysarthria severity.
- `normative` (open-data norms only) + `longitudinal` (delta vs
  patient baseline + minimum-detectable-change flag).
- `reporting` (HTML + PDF; MedRAG citations restricted to a curated
  starter list of ~30 PD / dysarthria / neuromod-voice papers in v1).
- `workflow_orchestration`: synchronous `run_full_pipeline` plus
  Celery enqueue path, both wired into the same FastAPI router pattern
  used by `apps/api`.

Explicitly **out of v1**: cognitive speech analyzers, respiratory /
cough analyzer, dystonia composite, language-aware lexical features
beyond English, GRBAS CNN model release.

### v2 — cognitive speech, respiratory, dystonia, multilingual

- `speech_linguistic_engine` becomes first-class (full Whisper / vosk
  adapter, prosody, lexical, syntactic features for ≥3 languages).
- `cognitive_speech_analyzers` (MCI / AD-spectrum risk index, per-task
  subscores).
- `respiratory_voice_analyzer` (cough + breath + composite risk).
- `dystonia_voice_index` ships as a calibrated composite.
- Auto-GRBAS estimator promoted to GA with a published validation set.
- Normative DB v2: pooled cohort with explicit demographic balance,
  optional commercial OEM hook (mirrors the qEEG NeuroGuide /
  qEEG-Pro path).
- Streaming / real-time path for in-clinic biofeedback on top of the
  same feature extractors.

---

## 8. File / folder structure

```
packages/audio-pipeline/
├── README.md
├── CLAUDE.md
├── AUDIO_ANALYZER_STACK.md            ← this document
├── pyproject.toml
├── docs/
│   └── AUDIO_ANALYZER.md              ← longform spec (v2)
├── src/
│   └── deepsynaps_audio/
│       ├── __init__.py
│       ├── ingestion.py               ← load_recording, import_session, to_bids
│       ├── quality.py                 ← LUFS / SNR / clipping / VAD / verdict
│       ├── acoustic/
│       │   ├── __init__.py
│       │   ├── pitch.py               ← F0 via Parselmouth
│       │   ├── perturbation.py        ← jitter / shimmer / HNR / NHR
│       │   ├── spectral.py            ← CPPS / LTAS slope / spectral tilt
│       │   ├── formants.py            ← F1–F4, VSA, dispersion
│       │   ├── mfcc.py                ← MFCC + Δ + ΔΔ summary
│       │   └── egemaps.py             ← openSMILE adapter
│       ├── clinical_indices.py        ← AVQI / DSI / GRBAS / voice break
│       ├── linguistic/
│       │   ├── __init__.py
│       │   ├── transcription.py       ← whisper / vosk adapter
│       │   ├── prosody.py             ← rate, pauses, hesitations
│       │   ├── lexical.py             ← TTR, MTLD, Brunet, Honoré, POS
│       │   └── syntactic.py           ← MLU, Yngve, embedded depth
│       ├── neurological/
│       │   ├── __init__.py
│       │   ├── parkinson.py           ← PD likelihood + Tsanas features
│       │   ├── dysarthria.py          ← severity + subtype hint
│       │   ├── ddk.py                 ← DDK rate / regularity / VOT
│       │   ├── dystonia.py            ← voice-break + strain composite
│       │   └── nonlinear.py           ← RPDE / DFA / PPE
│       ├── cognitive/
│       │   ├── __init__.py
│       │   ├── mci_risk.py            ← MCI / AD-spectrum risk score
│       │   └── tasks.py               ← per-task subscores
│       ├── respiratory/
│       │   ├── __init__.py
│       │   ├── cough.py               ← cough segmentation + class
│       │   ├── breath.py              ← breath cycle metrics
│       │   └── risk.py                ← composite respiratory risk
│       ├── normative/
│       │   ├── __init__.py
│       │   ├── database.py            ← norm bins loader
│       │   └── zscore.py              ← feature → ZScore
│       ├── longitudinal.py            ← Delta + Timeline + MDC
│       ├── reporting/
│       │   ├── __init__.py
│       │   ├── generate.py            ← Jinja2 → HTML → WeasyPrint PDF
│       │   ├── rag.py                 ← MedRAG citation resolver
│       │   └── templates/             ← .html.j2 clinical templates
│       ├── pipeline.py                ← end-to-end orchestrator
│       ├── api.py                     ← FastAPI endpoints
│       ├── worker.py                  ← Celery task wrappers
│       ├── cli.py                     ← `ds-audio` entrypoint
│       ├── constants.py               ← task protocols, frequency bands
│       ├── schemas.py                 ← pydantic dataclasses (Recording,
│       │                                  Session, *Features, *Score,
│       │                                  Delta, Timeline, ReportBundle)
│       └── db.py                      ← Postgres writer for audio_analyses
├── medrag_extensions/
│   ├── 06_migration_audio.sql         ← adds audio_analyses + voice entities
│   └── 07_seed_audio_entities.py      ← entity types: voice_metric,
│                                          ddk_metric, prosody_metric, etc.
├── portal_integration/
│   ├── DASHBOARD_PAGE_SPEC.md         ← React voice page spec
│   └── api_contract.md                ← request / response schema
├── demo/
│   ├── sample_audio_report.json
│   └── demo_end_to_end.py
└── tests/
    ├── fixtures/                      ← short licensed recordings
    │   ├── sustained_a.wav
    │   ├── reading_passage.wav
    │   └── ddk_pataka.wav
    ├── test_ingestion.py
    ├── test_quality.py
    ├── test_acoustic.py
    ├── test_clinical_indices.py
    ├── test_neurological.py
    └── test_pipeline.py
```

---

## 9. Recommended first 5 implementation tasks for agents

Feed these to the next round of cloud agents, one PR per task. Each
task is sized to land independently behind a feature flag in the
portal.

1. **Scaffold + I/O + QC.** Implement `ingestion.py`, `quality.py`,
   and `schemas.py`. Ship a CLI (`ds-audio qc <wav>`) that prints
   QC verdict + reasons. Tests over a 3-recording fixture set
   (clean, clipped, noisy). Wire the pyproject extras so the slim
   install only requires `numpy`/`scipy`/`soundfile` and the heavy
   clinical stack (`parselmouth`, `librosa`, `openSMILE`) sits in
   `[acoustic]`.

2. **Acoustic feature engine — Praat path.** Implement `pitch.py`,
   `perturbation.py`, `spectral.py`, `formants.py`, `mfcc.py` on top
   of Parselmouth and librosa. Return strongly-typed dataclasses.
   Cover sustained `/a/` + reading-passage paths. Tests against a
   reference vowel and assert ranges (jitter < 5 %, HNR > 0 dB, etc.).

3. **Clinical indices + neurological voice — PD/dysarthria pack.**
   Implement `clinical_indices.compute_avqi`, `voice_break_metrics`,
   plus `neurological/ddk.py`, `neurological/nonlinear.py` (RPDE /
   DFA / PPE), and a `neurological/parkinson.py` PD-voice likelihood
   wrapper around a small scikit-learn GBM trained on
   public-dataset features. Models stored in `models/` with a
   pinned version. Tests: end-to-end on the fixture sustained vowel
   should produce a finite likelihood and a non-empty `drivers`
   list.

4. **Pipeline orchestrator + reporting v1 + audit trail.** Implement
   `pipeline.run_full_pipeline(session)`, a Jinja2 HTML template
   covering the v1 outputs (acoustic indices, AVQI, PD likelihood,
   dysarthria severity, deltas vs baseline), a WeasyPrint PDF path,
   and `db.py` writing the new `audio_analyses` Postgres row
   (mirrors `qeeg_analyses`). Add `medrag_extensions/06_migration_audio.sql`.

5. **FastAPI + worker + portal hook.** Implement `api.py` (`/audio/upload`,
   `/audio/sessions/{id}/analyze`, `/audio/sessions/{id}/report`,
   `/patients/{id}/audio/timeline`) and `worker.py` Celery wrappers,
   then add the React voice page spec (`portal_integration/`)
   describing the recorder, task protocol picker, QC overlay, and
   results panel. Defer the actual React implementation to the
   `apps/web` agent — this PR ships the API contract + spec only.

---

## 10. Key references

- [Parselmouth (Praat in Python)](https://parselmouth.readthedocs.io/) — voice DSP backbone
- [Praat](https://www.fon.hum.uva.nl/praat/) — clinical-voice ground truth
- [openSMILE / eGeMAPS](https://www.audeering.com/research/opensmile/) — standardised voice biomarker set ([eGeMAPS paper](https://ieeexplore.ieee.org/document/7160715))
- [DisVoice](https://github.com/jcvasquezc/DisVoice) — phonation / articulation / prosody / glottal feature stacks for PD
- [Tsanas, Little et al. — PD voice telemonitoring](https://pubmed.ncbi.nlm.nih.gov/20142049/) — RPDE / DFA / PPE feature paradigm
- [AVQI-v3 multivariate voice quality index](https://pubmed.ncbi.nlm.nih.gov/31320252/) — clinical composite score
- [Cognitive speech biomarkers in MCI / AD review](https://pubmed.ncbi.nlm.nih.gov/35187032/) — lexical / syntactic / prosodic features
- [VOICED database](https://physionet.org/content/voiced/1.0.0/) — open clinical voice dataset
- [Saarbrücken Voice Database](http://www.stimmdatenbank.coli.uni-saarland.de/) — open clinical voice dataset
- [pyAudioAnalysis](https://github.com/tyiannak/pyAudioAnalysis) — cough / segmentation / classification utilities
- [PANNs audio tagging](https://github.com/qiuqiangkong/audioset_tagging_cnn) — pretrained "is this a cough" classifier
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — ASR for linguistic features
- [vosk](https://alphacephei.com/vosk/) — offline ASR fallback for telehealth
- [pyloudnorm](https://github.com/csteinmetz1/pyloudnorm) — LUFS loudness for QC
- [webrtcvad](https://github.com/wiseman/py-webrtcvad) — VAD for QC + segmentation
- [BIDS for audio / speech (proposal)](https://bids.neuroimaging.io/) — provenance and longitudinal storage
