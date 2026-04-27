# qEEG Upgrades Applied — 2026-04-26 Night Shift

Stream 1 (qEEG) — every change with file:line refs and acceptance check. Working-tree only; no commits or pushes per task brief.

## 1. Fallback bad-channel detection (correlation + deviation)

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/preprocess.py:171-260` — new `_detect_bad_channels_correlation_deviation` helper, plus rewritten `_fallback_average_ref` that runs detection → interpolation (when montage permits) → average reference, with safe handling when interpolation/reference would otherwise leave 0 valid channels.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/preprocess.py:106-119` — quality dict now records `bad_channel_detector` ∈ {`pyprep`, `correlation_deviation_fallback`}.

**Method**: PREP-style criteria — robust z-score of channel-wise std (>5.0 → bad) AND median absolute Pearson correlation to other channels (<0.4 → bad).

**Acceptance**:
- New test `test_fallback_bad_channel_detector_flags_extreme_std` injects a known 50× channel and asserts it appears in the flagged list. PASS.
- New test `test_quality_flag_set_when_pyprep_unavailable` asserts `quality["bad_channel_detector"] == "correlation_deviation_fallback"`. PASS.
- Existing `test_preprocess.py` (2 tests) still PASS.

## 2. Per-feature confidence on spectral output

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py:91-211` — return dict now contains `confidence.per_channel` (level + flags + n_epochs + R² + SNR proxy) and `method_provenance`.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py:35-39` — numpy 1.x/2.x `_trapz` shim (fixes pre-existing `np.trapz` removal in numpy 2.0).

**Method**: For each channel — heuristic level ∈ {low, moderate, high} based on (n_epochs ≥ 40, FOOOF R² ≥ 0.9, SNR proxy ≥ 5.0) — mirrors Brainstorm/Persyst per-channel reliability badges. SNR proxy = ratio of in-band (1-45 Hz) to high-frequency-tail (35+ Hz) integrated power.

**Acceptance**:
- Pre-existing `test_spectral.py::test_spectral_shape_and_alpha_peak` PASS (was previously broken on numpy 2.0; this PR fixes it).
- New schema verifiable via `clinical_summary.method_provenance.spectral` (covered by `test_method_provenance_non_empty_and_records_tools`). PASS.

## 3. Per-pair confidence + QC flags + provenance on asymmetry

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/asymmetry.py:23-127` — return dict augmented with `confidence` (per-pair, min-of-channel propagation from spectral confidence), `qc_flags`, `method_provenance`. `_ASYMMETRY_PAIRS` data preserved.

**Acceptance**:
- Existing `test_asymmetry.py` (3 tests) still PASS — value-only assertions are unchanged because numerical keys remain in place.

## 4. Top-level decision-support fields on PipelineResult + API output

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:32-58` — `PipelineResult` dataclass now exposes `qc_flags`, `confidence`, `method_provenance`, `limitations`.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:330-355` — Stage 6a now copies these fields up from `clinical_summary` so consumers can read them without descending into `features['clinical_summary']`.
- `apps/api/app/services/qeeg_pipeline.py:82-100` — `_pipeline_result_to_dict` forwards the same four fields into the JSON envelope returned to API/UI.

**Acceptance**: Verified by frontend tests reading top-level `qc_flags`, `confidence`, `limitations` directly (`pages-qeeg-decision-support.test.js`).

## 5. Structured stage-error envelope + structured limitations + evidence-pending hook in clinical_summary

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py:1-31` — module docstring + new `Callable`/`logging` imports.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py:46-180` — new top-level keys (`qc_flags`, `data_quality.stage_errors_structured`, `data_quality.bad_channel_detector`); `_structured_limitations()`; `_method_provenance()`; `_structured_stage_errors()`.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py:215-291` — `_observed_findings` accepts `evidence_lookup`; `_attach_evidence` adds real citations OR `{status:"evidence_pending", reason:…}`. Never fabricates.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:325-352` — orchestrator passes `_resolve_evidence_lookup()` into the summary builder.
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py:472-512` — new `_resolve_evidence_lookup()` helper: imports `deepsynaps_evidence` lazily, probes for `search_papers`, returns `None` if anything fails. Hard-coded to never raise.

**Acceptance**: 8 new tests (`test_clinical_summary_v2.py`) all PASS. Existing `test_clinical_summary.py::test_qeeg_clinical_summary_separates_observed_and_derived` still PASS.

## 6. Frontend decision-support card

**Files**:
- `apps/web/src/pages-qeeg-analysis.js:1745-1900` — new `renderQEEGDecisionSupport(analysis)` function rendering: confidence banner, qc_flags grid (severity-coloured borders), observed findings with evidence chips (real citations OR `data-testid="evidence-pending-chip"`), derived (model-derived, hedged) section, structured limitations.
- `apps/web/src/pages-qeeg-analysis.js:1902-1920` — `renderMNEPipelineSections` slots the new card in as the first section so QC + observed-vs-inferred is the top of the MNE block.

**No fake buttons**: every interactive element either is an existing API-backed action or simply renders text/href to PubMed.

**Acceptance**: 6 new JS tests (`pages-qeeg-decision-support.test.js`) all PASS. Existing 43 qEEG JS tests still PASS.

## 7. Numpy 1.x/2.x compat shim in spectral.py

**Files**:
- `packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py:35-39` — `_trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz")`.
- All `np.trapz` → `_trapz` (3 callsites in spectral.py).

**Rationale**: numpy 2.0 removes `np.trapz`. Pre-existing test failure unblocked.

**Acceptance**: `test_spectral.py::test_spectral_shape_and_alpha_peak` and `test_asymmetry.py::test_asymmetry_with_synthetic_raw` (which depends on spectral) now PASS where they previously failed.

## Touched-files index (working tree only)

```
packages/qeeg-pipeline/src/deepsynaps_qeeg/preprocess.py
packages/qeeg-pipeline/src/deepsynaps_qeeg/features/spectral.py
packages/qeeg-pipeline/src/deepsynaps_qeeg/features/asymmetry.py
packages/qeeg-pipeline/src/deepsynaps_qeeg/clinical_summary.py
packages/qeeg-pipeline/src/deepsynaps_qeeg/pipeline.py
apps/api/app/services/qeeg_pipeline.py
apps/web/src/pages-qeeg-analysis.js
```

New tests:

```
packages/qeeg-pipeline/tests/test_clinical_summary_v2.py
packages/qeeg-pipeline/tests/test_io_malformed.py
packages/qeeg-pipeline/tests/test_preprocess_fallback.py
apps/web/src/pages-qeeg-decision-support.test.js
```

New docs:

```
docs/overnight/2026-04-26-night/qeeg_current_state.md
docs/overnight/2026-04-26-night/qeeg_best_practice_matrix.md
docs/overnight/2026-04-26-night/qeeg_tests_added.md
docs/overnight/2026-04-26-night/qeeg_upgrades_applied.md
```

## Untouched (per scope)

`packages/mri-pipeline/`, `packages/feature-store/`, `apps/api/app/routers/fusion_router.py`, `apps/web/src/pages-mri-*.js`, `apps/web/src/pages-fusion*` — confirmed unchanged.

## Handoffs to other streams

- **Risk/Scoring stream**: top-level `qc_flags`, `confidence`, `method_provenance` now available on the qEEG analysis JSON envelope. Risk scores can attribute themselves to (or down-weight against) qEEG features whose `confidence.level === "low"`.
- **Evidence/Reports stream**: `clinical_summary.observed_findings[].evidence` is either `{status:"found", citations:[…]}` or `{status:"evidence_pending", reason}`. Report renderer should surface a "evidence pending" chip when status ≠ found instead of generating prose. The pipeline's `_resolve_evidence_lookup` probes `deepsynaps_evidence.search_papers(label, limit=3)` — if Evidence stream changes that signature, update the probe in `pipeline.py:489`.
- **Fusion stream**: same top-level `qc_flags`/`confidence`/`limitations` are available; fusion outputs may now report "qEEG confidence: low → fusion downgraded".
- **DigitalTwin stream**: same envelope. Simulator can refuse to run when `qc_flags` includes `stage_error_*` codes with `severity: high`.
- **DevOps**: install `nibabel` to unblock `test_source.py`; consider `pip install -e packages/qeeg-pipeline` so tests don't need `PYTHONPATH=packages/qeeg-pipeline/src`.
