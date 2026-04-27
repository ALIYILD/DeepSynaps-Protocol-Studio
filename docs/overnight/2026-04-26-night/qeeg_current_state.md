# qEEG Current State Audit — 2026-04-26 Night Shift

Scope: `packages/qeeg-pipeline/`, `packages/qeeg-encoder/`, `apps/api/app/routers/qeeg_*`, `apps/api/app/services/qeeg*` + `services/analyses/*`, `apps/web/src/pages-qeeg-*.js`.

Legend: REAL = working code that touches actual signal; STUB = empty/synthetic/no-op; PARTIAL = real but with caveats; MISSING = not implemented.

## 1. File Ingest

| Format | Status | File | Notes |
|---|---|---|---|
| EDF / EDF+ | REAL | `packages/qeeg-pipeline/src/deepsynaps_qeeg/io.py:77` | `mne.io.read_raw_edf`. EDF magic-byte check in `apps/api/app/routers/qeeg_analysis_router.py:71`. |
| BrainVision (.vhdr triplet) | REAL | `io.py:81` | Auto-redirects from `.eeg` to `.vhdr`. |
| BDF | REAL | `io.py:83` | `read_raw_bdf`. |
| EEGLAB (.set) | REAL | `io.py:85` | `read_raw_eeglab`. |
| FIF | REAL | `io.py:87` | `read_raw_fif`. |
| Validation | REAL | `io.py:97` | min sfreq 128 Hz, min 16 EEG channels, min 30 s recording. Raises `EEGIngestError`. |
| Channel canonicalisation | REAL | `io.py:114` | T3→T7, T4→T8, T5→P7, T6→P8 synonyms applied. |
| Montage | REAL | `io.py:122` | `make_standard_montage('standard_1020')`, `on_missing='warn'`. |
| Upload route limits | REAL | `qeeg_analysis_router.py:65` | 100 MB cap, allowlist `{.edf, .edf+, .bdf, .bdf+, .eeg}` (note: `.vhdr/.set/.fif` allowed by pipeline but not by upload allowlist — see Gap §G1). |

## 2. Preprocessing

| Stage | Status | File | Notes |
|---|---|---|---|
| Robust avg ref + bad-channel detection | REAL (PyPREP) | `preprocess.py:119` | `PrepPipeline`, fallback to plain `set_eeg_reference('average')` when PyPREP missing/fails. Reports `prep_used` in quality. |
| Bandpass | REAL | `preprocess.py:78` | FIR firwin, zero-phase, 1.0–45.0 Hz, `skip_by_annotation='edge'`. |
| Notch | REAL | `preprocess.py:88` | Configurable Hz (default 50; 60 supported via override). |
| Resample | REAL | `preprocess.py:100` | Target 250 Hz, performed AFTER filtering. |
| Quality dict | REAL | `preprocess.py:106` | `bad_channels`, `n_channels_*`, `sfreq_*`, `bandpass`, `notch_hz`, `prep_used`. |
| Independent secondary bad-channel scan (correlation + deviation criteria) | MISSING | — | Falls back to PyPREP only; no explicit Pearson-correlation / robust-deviation pass when PyPREP is unavailable (Gap §G2). |

## 3. Artifact rejection / Epoching

| Stage | Status | File | Notes |
|---|---|---|---|
| ICA fit (picard, fallback infomax) | REAL | `artifacts.py:155` | `n_components = min(n_eeg-1, 30)`. Fitted on 1 Hz HP copy. Random state 42. |
| ICLabel auto-classification | REAL | `artifacts.py:200` | Drops `{eye, muscle, heart, line_noise, channel_noise}` with proba > 0.7. |
| User ICA overrides | REAL | `artifacts.py:80` | `ica_exclude_override`, `ica_keep_override` from interactive Raw Viewer. |
| Fixed-length 2 s epochs, 50 % overlap | REAL | `artifacts.py:107` | `make_fixed_length_events`, fallback to legacy `overlap=` kwarg. |
| Edge discard 10 s start / 5 s end | REAL | `artifacts.py:103` | Constants in module. |
| AutoReject (local) | REAL | `artifacts.py:227` | Falls back gracefully if missing. |
| Quality counters (`n_epochs_total`, `n_epochs_retained`, `iclabel_used`, `autoreject_used`, `ica_components_dropped`, `ica_labels_dropped`) | REAL | `artifacts.py:142` | All flagged. Warning when `<40` epochs retained. |
| ASR (Artifact Subspace Reconstruction) | MISSING | — | Not in stack; community recommends as belt-and-braces alternative when ICA fails (Gap §G3). |

## 4. Spectral features

| Output | Status | File | Notes |
|---|---|---|---|
| Welch absolute & relative band powers | REAL | `features/spectral.py:80` | µV²/Hz units; per-channel; bands δ θ α β γ. |
| 1/f aperiodic (slope, offset, R²) via FOOOF | REAL (graceful skip) | `features/spectral.py:155` | If FOOOF missing, returns `None` per channel + warning. Knee-mode aware. |
| Peak alpha frequency | REAL | `features/spectral.py:198` | FOOOF peak_params, fallback to argmax in 7–13 Hz when FOOOF missing or fit fails. |
| PSD computation | REAL | `features/spectral.py:104` | Tries `epochs.compute_psd('welch')`; falls back to `scipy.signal.welch`. |
| Per-frequency confidence (SNR-based) | MISSING | — | No confidence per spectral feature; only an aggregated quality-derived confidence in clinical_summary (Gap §G4). |

## 5. Asymmetry

| Output | Status | File | Notes |
|---|---|---|---|
| Frontal Alpha Asymmetry F3/F4, F7/F8 | REAL | `features/asymmetry.py:23` | `ln(right) − ln(left)` of absolute alpha. None when channel missing or non-positive power. |
| Other asymmetry pairs (P3/P4, T7/T8, frontal-theta) | MISSING | — | Could add per Coan & Allen (2004) and posterior alpha. (Gap §G5, low priority). |

## 6. Connectivity

| Output | Status | File | Notes |
|---|---|---|---|
| wPLI per band | REAL | `features/connectivity.py:62` | `mne_connectivity.spectral_connectivity_epochs`, multitaper mode, `faverage=True`. |
| Coherence per band | REAL | same | Returned alongside wPLI. |
| AEC / PLV | MISSING | — | Mentioned in CLAUDE.md but not computed. (Gap §G6, low priority). |
| Confidence interval / surrogate stats | MISSING | — | No bootstrap / surrogate test; raw value only. (Gap §G7). |

## 7. Graph metrics

| Output | Status | File | Notes |
|---|---|---|---|
| Top-20% edge thresholding | REAL | `features/graph.py:89` | Per band. |
| Clustering coefficient | REAL | `features/graph.py:71` | Weighted. |
| Char path length on largest CC | REAL | `features/graph.py:115` | Unweighted (correctly noted in code comment). |
| Small-worldness (10 random graphs) | REAL | `features/graph.py:137` | Configuration-model surrogate. |
| Output is `nan`-safe | REAL | `features/graph.py:179` | All metrics returned as float, NaN when undefined. |

## 8. Complexity

| Output | Status | File | Notes |
|---|---|---|---|
| Sample / Approximate Entropy | REAL | `apps/api/app/services/analyses/complexity.py:93` | Hand-coded; sub-samples to 3000 points for performance. |
| Higuchi FD | REAL | `complexity.py:163` | Multiple kmax (5,10,15,20). |
| Lempel-Ziv (binarised at median) | REAL | `complexity.py:137` | LZ76. |
| Multiscale Entropy + complexity index | REAL | `complexity.py:247` | Scales 1–20, area under curve. |
| Used by main pipeline output? | PARTIAL | — | Lives in API "advanced analyses" path, not in `pipeline.py` features dict. UI surfaces via `analysis.advanced_analyses.results.*`. |

## 9. Source localization

| Output | Status | File | Notes |
|---|---|---|---|
| eLORETA on fsaverage | REAL | `pipeline.py:230`, `source/{forward,inverse,roi}.py` | Per band; ROI band power in DK atlas; saved as PNG snapshots when out_dir set. |
| Quality guard (≥19 channels, ≥20 epochs, <30% bad) | REAL | `pipeline.py:457` | Otherwise skipped with `source_skipped_reason` in quality. |
| sLORETA fallback (per CLAUDE.md) | MISSING | — | Hard-coded eLORETA. (Gap §G8, low priority). |

## 10. Normative z-scoring

| Output | Status | File | Notes |
|---|---|---|---|
| Z-scores from age/sex norms | REAL | `normative/zscore.py` (called pipeline.py:311) | Returns `{spectral, aperiodic, flagged, norm_db_version}`. |
| GAMLSS pathway | REAL | `normative/gamlss.py` | Available alternative. |
| Confidence on each z (SE) | PARTIAL | — | Norm DB returns z, no SE / posterior interval surfaced (Gap §G9). |

## 11. Clinical summary / Decision-support

| Output | Status | File | Notes |
|---|---|---|---|
| `module`, `patient_context`, `confidence` | REAL | `clinical_summary.py:62` | |
| `data_quality.flags` (low_clean_epoch_count, high_bad_channel_ratio, etc.) | REAL | `clinical_summary.py:103` | severity = high/medium/low. |
| `observed_findings` (normative deviations, mean PAF, FAA) | REAL | `clinical_summary.py:182` | |
| `derived_interpretations` (hedged) | REAL | `clinical_summary.py:233` | Always `clinician_review_required`. |
| `limitations`, `recommended_review_items` | REAL | `clinical_summary.py:76` | |
| `method_provenance` (pipeline_version, norm_db, preprocessing, citations) | REAL | `clinical_summary.py:82` | Includes 4 method citations (MNE, PyPREP, autoreject, SpecParam). |
| `safety_statement` | REAL | `clinical_summary.py:96` | Avoids "diagnosis", "treatment". |
| Per-finding evidence-layer linkage (PubMed IDs) | MISSING | — | No call into `services/evidence-pipeline` from clinical_summary. (Gap §G10). |
| Per-feature `confidence` + `qc_flags` arrays in feature dicts | PARTIAL | — | Aggregated only. Spectral / connectivity / asymmetry features lack their own confidence + QC flags. (Gap §G4 + G11). |

## 12. Embeddings

| Output | Status | File | Notes |
|---|---|---|---|
| LaBraM / EEGPT foundation embeddings | REAL (gated) | `pipeline.py:170`, `embeddings/{labram,eegpt}.py` | `compute_embeddings=True`. Saved as `embeddings.npz` when out_dir set. |
| Conformal wrapper | REAL | `qeeg-encoder/src/qeeg_encoder/conformal/wrapper.py` | Available for downstream; not wired into pipeline output by default. |

## 13. Reports

| Output | Status | File | Notes |
|---|---|---|---|
| HTML/PDF render | REAL (gated) | `report/{generate,weasyprint_pdf,mne_report_builder}.py` | Optional `[reporting]` extra. |
| RAG-grounded narrative | REAL | `report/rag.py`, `narrative/*.py`, `apps/api/app/services/qeeg_rag.py` | Uses 87k-paper DB (Postgres pgvector). |
| Method provenance in report header | PARTIAL | `report/generate.py` (not reviewed in detail) | Pipeline+norm DB versions stamped at end of `pipeline.run_full_pipeline`; UI strip exposes them. |

## 14. API endpoints (qEEG routers)

| Router | Prefix | Notes |
|---|---|---|
| `qeeg_analysis_router.py` | `/api/v1/qeeg-analysis` | 3041 LOC; upload / analyze / analyze-mne / run-advanced / get / list / ai-report / compare / longitudinal / quality-check / events SSE / assessment-correlation. Returns `AnalysisOut` with `quality_metrics`, `band_powers`, `aperiodic`, `peak_alpha_freq`, `clinical_summary` keys. |
| `qeeg_raw_router.py` | `/api/v1/qeeg-raw` | Channel info, raw / cleaned signals, ICA components + timecourse, cleaning-config, reprocess. |
| `qeeg_viz_router.py` | `/api/v1/qeeg-viz` | Topomap, band grid, connectivity chord/heatmap, source images, V2 PDF. |
| `qeeg_copilot_router.py` | `/api/v1/qeeg-copilot` | WebSocket; backed by `deepsynaps_qeeg.ai.copilot`. |
| `qeeg_live_router.py` | `/api/v1/qeeg/live` | Streaming feature flag. |
| `qeeg_records_router.py` | `/api/v1/qeeg-records` | CRUD on `QEEGRecord`. |

## 15. Frontend

| Page | LOC | Notes |
|---|---|---|
| `pages-qeeg-analysis.js` | 5713 | Main hub. Renders pipeline-quality strip (`renderPipelineQualityStrip` ~L892), SpecParam panel, eLORETA ROI, normative topo grid + heatmap, connectivity chord, asymmetry strip, AI narrative w/ citations. Shows confidence_level badge. |
| `pages-qeeg-raw.js` | 1322 | Interactive cleaning UI (bad chans, ICA, annotations). |
| `pages-qeeg-viz.js` | 578 | Pure visualisation page. |
| `qeeg-ai-panels.js` | 1027 | AI side panels. |
| `qeeg-dk-atlas.js` | 124 | DK atlas helpers. |

## 16. Tests

| File | Coverage |
|---|---|
| `apps/api/tests/test_qeeg_*.py` (8) | router behaviour, ai-bridge, ai-interpreter, RAG, records. |
| `packages/qeeg-pipeline/tests/test_*.py` (26) | Each module (preprocess, artifacts, spectral, connectivity, graph, asymmetry, source, brain_age, normative, gamlss, longitudinal, narrative, recommender, similar_cases, embeddings, foundation_embedding, copilot_backend, explainability, rag, medrag, risk_scores, clinical_summary, streaming, pipeline). All gated with `pytest.importorskip('mne')`. |
| Frontend | `pages-qeeg-analysis*.test.js` x3 (1078 LOC). |

## 17. Key Gaps (referenced from §1-16)

| ID | Gap | Severity | Tonight? |
|---|---|---|---|
| G1 | Upload allowlist (`qeeg_analysis_router.py:68`) excludes `.vhdr/.set/.fif` despite pipeline supporting them | low | N |
| G2 | No fallback bad-channel scan when PyPREP unavailable | medium | Y |
| G3 | No ASR fallback for ICA-failure cases | low | N (would need optional dep) |
| G4 | No per-feature SNR / n-epochs / channel-validity confidence | high | Y |
| G5 | Asymmetry only F3/F4 + F7/F8 | low | N |
| G6 | No AEC / PLV connectivity | low | N |
| G7 | No surrogate stats on connectivity | medium | N |
| G8 | No sLORETA fallback for source loc | low | N |
| G9 | No SE / posterior interval on z-scores | medium | N (norm DB level) |
| G10 | Clinical summary findings have NO evidence-layer linkage | high | Y |
| G11 | Output schema lacks unified `qc_flags` + `confidence` + `method_provenance` + `limitations` arrays at the top level (only inside clinical_summary) | high | Y |
| G12 | clinical_summary swallows exceptions silently — no structured error envelopes for individual analyzers | medium | Y |
| G13 | UI shows quality pills but does not render `qc_flags`, `observed vs inferred` separation, or `evidence pending` per finding | high | Y |

## 18. Real vs stub vs missing summary

- REAL & solid: I/O, preprocessing, artifacts/ICA/AutoReject, spectral, connectivity, graph, asymmetry, source loc, normative z, clinical_summary aggregator, advanced complexity (in services/analyses), pipeline orchestrator with stage_errors.
- PARTIAL: Foundation embeddings (gated by `compute_embeddings=True`), report PDF (needs `[reporting]` extra), per-feature confidence (only aggregated), method provenance (only inside clinical_summary).
- MISSING: ASR fallback, AEC/PLV, sLORETA fallback, surrogate connectivity stats, per-z SE, evidence-layer linkage on findings, unified output schema with qc_flags + confidence + limitations arrays, frontend rendering of qc_flags/observed-vs-inferred/evidence-pending.

## 19. Local run blocker

- Python 3.8 is the only `python3` on this machine; `mne`, `numpy`, `scipy`, `fooof` etc. are not installed in any venv. `uv` is not on PATH. Pipeline tests will SKIP locally via `pytest.importorskip('mne')`. This is a DevOps blocker, not a code blocker — the pipeline's runtime container has these deps. Tests added tonight will be importable & run on CI.
