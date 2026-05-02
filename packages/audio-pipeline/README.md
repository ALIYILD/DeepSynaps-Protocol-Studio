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
