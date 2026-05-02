# DeepSynaps Audio / Voice Analyzer

Sibling module to `deepsynaps_qeeg` and `deepsynaps_mri`. A clinician,
SLP, or remote patient submits short voice recordings (sustained vowel,
reading passage, counting, DDK, free speech, optional cough/breath).
The portal returns a clinical-grade voice report:

- acoustic feature engine (F0, jitter, shimmer, HNR, NHR, CPPS, LTAS
  slope, formants, MFCC, eGeMAPS);
- clinical voice-quality indices (AVQI-v3, DSI-like, GRBAS estimator,
  voice-break metrics);
- neurological voice analyzers (Parkinson’s likelihood, dysarthria
  severity, DDK metrics, dystonia composite, RPDE / DFA / PPE
  nonlinear features);
- speech-linguistic engine (speech rate, pause statistics, lexical
  diversity, syntactic complexity, idea density — when transcripts
  are available);
- cognitive speech analyzers (MCI / AD-spectrum risk, per-task
  subscores) — v2;
- respiratory / cough analyzer (cough segmentation, breath-cycle
  metrics, respiratory acoustic risk score) — v2;
- normative + longitudinal tracking (age/sex/language-binned z-scores,
  patient-as-own-baseline deltas, minimum-detectable-change flags);
- reporting + MedRAG citations grounded in the 87k-paper DeepSynaps
  corpus.

This is the **Voice Analyzer** page in the DeepSynaps Studio sidebar.

## Status

Scaffold + design specification. The authoritative design document is
[`AUDIO_ANALYZER_STACK.md`](./AUDIO_ANALYZER_STACK.md), which contains
the full module architecture, function table, MVP-vs-v2 split,
file/folder layout, and a prioritised list of the next 5
implementation tasks for cloud agents.

`CLAUDE.md` is the per-package memory file that downstream Claude Code
sessions read on every run.

## Research / decision-support positioning

Acoustic and risk outputs are **clinical decision-support and research-monitoring signals**, not standalone diagnoses, FDA-cleared tests, or treatment instructions. Use with full clinical context, appropriate consent, and (when indicated) speech–language or specialist assessment.

## Clinician API and persistence

The Studio API exposes multipart upload (`POST /api/v1/audio/analyze-upload`) and session-recording analysis (`POST /api/v1/audio/analyze-recording/{recording_id}`) so clinicians never need a raw server-side path. Set `DEEPSYNAPS_AUDIO_RUN_STORE_DIR` on workers so pipeline run records are written to disk and survive process restarts.

## Quickstart

```bash
pip install -e packages/audio-pipeline
# Heavy clinical stack (Parselmouth, librosa, openSMILE, faster-whisper)
# lives in optional extras — add them when implementing each stage:
pip install -e 'packages/audio-pipeline[acoustic,linguistic,reporting]'
```

CLI entrypoint:

```bash
ds-audio --help
```

## Layout

See [`AUDIO_ANALYZER_STACK.md` §8](./AUDIO_ANALYZER_STACK.md#8-file--folder-structure)
for the full target tree under `src/deepsynaps_audio/`.
