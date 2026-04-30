# qEEG Tests Added — 2026-04-26 Night Shift

## New test files

### `packages/qeeg-pipeline/tests/test_clinical_summary_v2.py` — 8 tests

Covers the night-shift output schema additions to `build_clinical_summary`:

| Test | What it verifies |
|---|---|
| `test_top_level_schema_has_all_decision_support_keys` | `qc_flags`, `confidence`, `method_provenance`, `limitations` are top-level keys (not nested in `data_quality`) and `data_quality.flags` mirrors `qc_flags` for backwards compat. |
| `test_method_provenance_non_empty_and_records_tools` | provenance contains pipeline_version, norm_db_version, preprocessing dict (with `bad_channel_detector`), spectral & asymmetry sub-dicts, and ≥4 method citations. |
| `test_limitations_are_structured_objects_not_strings` | each limitation is a dict with `code`, `severity`, `message`; baseline + low-epoch limitation codes both present. |
| `test_evidence_pending_when_no_lookup_provided` | when `evidence_lookup=None`, every observed finding carries `evidence={status:"evidence_pending", reason:"no_evidence_lookup_provided"}`. No fabrication. |
| `test_evidence_lookup_callable_forwards_real_citations` | when a callable returning real citations is passed, findings carry `evidence.status="found"` with up to 3 cleaned citation dicts. |
| `test_evidence_lookup_raising_marks_pending_does_not_blow_up` | a raising lookup downgrades to `evidence_pending` with reason `lookup_error: …`; no exception bubbles. |
| `test_structured_stage_error_envelope` | `data_quality.stage_errors_structured` is a list of envelopes with `code`, `stage`, `severity`, `recoverable`, `partial_output_available`. |
| `test_low_quality_data_degrades_gracefully` | with empty features + 3 epochs + 5 bad channels + a stage error, summary still returns a well-shaped dict; confidence='low'; expected QC codes present. |

### `packages/qeeg-pipeline/tests/test_io_malformed.py` — 3 tests

| Test | What it verifies |
|---|---|
| `test_unknown_extension_raises_eegingest_error` | bogus `.txt` rejected with `EEGIngestError`. |
| `test_missing_file_raises_eegingest_error` | non-existent path rejected with `EEGIngestError`. |
| `test_truncated_edf_does_not_silently_pass` | 1-byte garbage `.edf` raises (gated `mne.importorskip`). |

### `packages/qeeg-pipeline/tests/test_preprocess_fallback.py` — 2 tests

| Test | What it verifies |
|---|---|
| `test_fallback_bad_channel_detector_flags_extreme_std` | a 50× std-injected channel ("T8") is correctly flagged by the new `_detect_bad_channels_correlation_deviation` helper. |
| `test_quality_flag_set_when_pyprep_unavailable` | when the fallback path is exercised, `quality["prep_used"] is False` and `quality["bad_channel_detector"] == "correlation_deviation_fallback"`. |

### `apps/web/src/pages-qeeg-decision-support.test.js` — 6 tests

| Test | What it verifies |
|---|---|
| empty in / empty out | `renderQEEGDecisionSupport(null)` and `renderQEEGDecisionSupport({})` both return `''`. |
| renders qc_flags + confidence | confidence banner with `data-testid="qeeg-ds-confidence"` + per-flag rows with severity badges and message strings. |
| evidence-pending chip | observed findings without citations render the `data-testid="evidence-pending-chip"` chip. Derived interpretations render in their own `data-testid="qeeg-ds-derived"` block. |
| real citations rendered | when `evidence.status === 'found'`, citation titles + URLs are linked and the evidence-pending chip is absent. |
| structured limitations | `data-testid="qeeg-ds-limitations"` rendered with severity prefixes. |
| top-level-only fallback | renders correctly even when `clinical_summary` is absent and only top-level `qc_flags` are present. |

## Pass/fail recorded run

### Frontend (Node node:test)

```
node --test apps/web/src/pages-qeeg-decision-support.test.js
✔ all 6 tests pass (64 ms)

node --test apps/web/src/pages-qeeg-analysis-page.test.js
✔ all 7 existing tests still pass (134 ms)

node --test apps/web/src/pages-qeeg-analysis-mne.test.js apps/web/src/pages-qeeg-analysis-ai-upgrades.test.js
✔ all 43 existing tests still pass (65 ms)
```

### Backend (pytest 3.11 system)

```
PYTHONPATH=packages/qeeg-pipeline/src pytest \
  packages/qeeg-pipeline/tests/test_clinical_summary_v2.py \
  packages/qeeg-pipeline/tests/test_io_malformed.py \
  packages/qeeg-pipeline/tests/test_preprocess_fallback.py -v
13 passed in 0.84s
```

```
PYTHONPATH=packages/qeeg-pipeline/src pytest packages/qeeg-pipeline/tests/ -v
94 passed, 3 failed, 1 skipped, 1 warning in 19.68s
```

The 3 failures are **all in `test_source.py`** and **all upstream**: `ModuleNotFoundError: No module named 'nibabel'`. They require the `nibabel` system dep for surface geometry reading — DevOps blocker, not introduced by this work. Filed below.

```
pytest apps/api/tests/test_qeeg*.py -q
57 passed, 1 skipped, 1 warning in 16.03s
```

## DevOps blockers (do not block tonight's merge)

- `nibabel` is not installed in the test environment; `test_source.py::*` (3 tests) require it. The runtime container provides it.
- `pyprep` not installed in the test env — falls through to the new correlation+deviation detector at runtime, which is what `test_preprocess_fallback.py` exercises directly.
- `python` (no version suffix) is not on PATH; only `python3` (3.8) and `/opt/homebrew/bin/python3.11`. Tests above were run with `pytest` (Python 3.11). Makefile assumes a `.venv` with the package installed; `pyproject.toml` `editable install` of `deepsynaps-qeeg` would remove the need to set `PYTHONPATH` manually.
