# EEG Studio — golden fixtures & WinEEG references

## Purpose

Validate DeepSynaps EEG Studio pipelines against **known-good outputs** (WinEEG or validated lab exports). Each fixture pairs an **EDF** with a **reference metrics/report bundle** for automated diff.

## Layout (target)

```
tests/fixtures/eeg_studio/
  README.md                    # this file
  routine_eyes_open_eyes_closed.edf
  routine_eyes_open_eyes_closed.reference.json   # spectra, indices, asymmetry
  oddball_p300.edf
  oddball_p300.reference.json                    # ERP peaks, optional source
  gonogo_tova.edf
  gonogo_tova.reference.json
  epilepsy_ied.edf
  epilepsy_ied.reference.json                  # spike times vs labels
  pediatric_adhd_qeeg.edf
  pediatric_adhd_qeeg.reference.json             # theta/beta, z vs pediatric norm
  pre_post_tms.edf
  pre_post_tms.reference.json                    # paired comparison metrics
  windeg_reports/                              # optional PDF/RTF/text exports for diff
```

## Reference JSON schema (convention)

Each `*.reference.json` SHOULD include:

- `fixture_id` — basename without `.edf`
- `norm_version` — string identifying norm database revision
- `metrics` — module-specific flat or nested numbers (z-scores, peak latencies in ms, µV amplitudes)
- `tolerances` — optional per-key absolute/relative tolerance for tests

Exact schema may evolve; document changes in PR that adds the first golden test.

## Licensing & PHI

- Do not commit **real patient** data without IRB / consent and data-use agreement.
- Prefer **synthetic** EDFs, **de-identified** research releases, or **vendor** demo files approved for redistribution.
- Document provenance in a `SOURCES.md` (optional) next to this README when files land.

## Tests that consume these

- **Backend:** `pytest` in `apps/api/tests/` — load EDF via MNE, run pipeline step, compare to `metrics` within `tolerances`.
- **Frontend:** Playwright smoke may **skip** if fixtures absent; CI full gate enables when `EEG_STUDIO_GOLDEN=1` or files present.

## WinEEG parity

When available, store WinEEG-exported **numeric tables** (CSV/JSON) under `windeg_reports/` for the same recording to diff spectral peaks, ERP component latencies, etc.
