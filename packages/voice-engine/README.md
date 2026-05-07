# voice-engine

Clinical voice analysis pipeline. **Scaffold only — no logic implemented yet.**

## Status

| Module | State |
| --- | --- |
| `audio_io.py` | stub (validate, normalise, write WAV) |
| `transcription.py` | stub (Whisper ASR + word timestamps) |
| `emotion.py` | stub (SpeechBrain SER) |
| `biomarkers.py` | stub (Praat: F0, jitter, shimmer, HNR, MFCCs) |
| `scoring.py` | stub (XGBoost: depression / anxiety / stress) |
| `report.py` | stub (clinician summary builder) |
| `pipeline.py` | stub (end-to-end orchestrator) |
| `tests/test_audio_io.py` | 3 placeholder tests (xfail, scaffold only) |
| `tests/test_biomarkers.py` | 2 placeholder tests (xfail, scaffold only) |

Every module function currently raises `NotImplementedError`. Importing the
package will fail in any environment that does not have the heavy dependencies
listed below installed.

## Dependencies

See `requirements.txt`:

- `openai-whisper` — ASR
- `praat-parselmouth` — acoustic biomarkers
- `speechbrain`, `torch`, `torchaudio` — speech emotion model
- `xgboost` — risk scoring
- `librosa`, `scipy`, `numpy` — audio I/O and feature extraction
- `fastapi`, `python-multipart` — upload surface (router lives elsewhere)

## Next implementation step

Start with `audio_io.py`. The first failing test should be
`test_validate_upload_rejects_unsupported_format` — flip its decorator from
`xfail` to a real assertion against `audio_io.validate_upload`, then
implement the minimal validator. Continue stage-by-stage in pipeline order:
`audio_io → transcription → biomarkers → emotion → scoring → report → pipeline`.

## Relationship to existing audio-pipeline

`packages/audio-pipeline/` already provides cognitive-speech and
respiratory-voice analyzers. `voice-engine` is a parallel module targeting
the new React `apps/deepsynaps-studio` frontend. Migration / consolidation
is a separate decision once both pipelines are at parity.
