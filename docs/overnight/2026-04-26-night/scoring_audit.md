# Scoring Audit — Stream 4 (Risk / Scoring / Decision-Support)

Generated: 2026-04-26 (overnight)

Scope: anxiety, depression, stress, MCI / cognitive risk, brain-age, relapse risk, adherence risk, response probability.

This audit covers ONLY the eight clinical decision-support scores in scope.
The 8-category traffic-light "risk stratification" engine
(`risk_stratification.py`, allergy / suicide_risk / mental_crisis /
self_harm / harm_to_others / seizure_risk / implant_risk /
medication_interaction) is a separate hard-safety contraindication system —
left intact, audited as already-mature.

Legend (evidence labels): 🟢 measured | 🟡 estimated | 🔴 simulated | ⚪ missing

---

## 1. Anxiety score

| Field | Status |
|---|---|
| Where computed | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py:179` (`_stub_scores`) emits `anxiety_like` (similarity index, 0..1, CI95). |
| Logic kind | hybrid — biomarker prior on posterior alpha + deterministic-stub seed + (optional) torch MC-dropout when checkpoint shipped (currently raises → stub). |
| Input features | spectral.bands.alpha (posterior channels O1/O2/P3/P4/Pz). |
| Validated assessment anchor | Available via `assessment_scoring.py` — **GAD-7** (`prefix gad7_`, count 7, max 21) and **HAM-A** (max 56). NOT currently consumed by `anxiety_like`. |
| Confidence / uncertainty present | yes — CI95 and `confidence.level` (low/moderate/high) — **but** label is `moderate` not standardised `med`. |
| Caution / safety bands | partial — `disclaimer` + `evidence_policy.caution` only (string). No structured cautions array. |
| Top contributors exposed | yes — `drivers[]` (≤3) with feature/value/direction. |
| Evidence linkage | none — biomarker similarity only; no PubMed / corpus ref pulled. |
| Gaps | (a) GAD-7 not used as primary anchor; (b) `confidence.level` taxonomy `moderate` ≠ `med`; (c) no evidence_refs hook; (d) inputs_hash not surfaced for audit; (e) "anxiety" label conflated with "anxiety_like" — clinician-facing wording must hedge. |

## 2. Depression score

| Field | Status |
|---|---|
| Where computed | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py:179` emits `mdd_like`. |
| Logic kind | hybrid (biomarker prior on frontal alpha asymmetry F3-F4). |
| Input features | asymmetry.frontal_alpha_F3_F4. |
| Validated assessment anchor | Available — **PHQ-9** (max 27), **HAM-D** (max 52), **BDI/BDI-II** (max 63) via `assessment_scoring.py`. PHQ-9 item 9 already harvested by `risk_stratification._evaluate_suicide_risk` for hard safety. NOT consumed by `mdd_like`. |
| Confidence / uncertainty present | yes — CI95 + `confidence.level`. |
| Caution / safety bands | string-level only (disclaimer). |
| Top contributors exposed | yes (`drivers`). |
| Evidence linkage | none. |
| Gaps | PHQ-9 anchor missing; should also surface PHQ-9 item-9 caution; same taxonomy + inputs_hash gaps as Anxiety. |

## 3. Stress score

| Field | Status |
|---|---|
| Where computed | NOT computed today. No file emits a stress score. Closest signal: `wearable_summaries.anxiety_score`, sleep / HRV from `device_sync` (`apps/api/app/services/device_sync/*`). |
| Logic kind | n/a |
| Input features | none yet — would derive from wearable HRV / sleep / mood + PSS-10. |
| Validated assessment anchor | **PSS-10** — currently NOT in `assessment_scoring._PREFIX_SCORING`. Catalog gap. |
| Confidence / uncertainty present | n/a |
| Cautions / bands | n/a |
| Top contributors | n/a |
| Evidence linkage | n/a |
| Gaps | Score does not exist. Stream 4 will introduce a derived stress score: PRIMARY = PSS-10 when present, SUPPORTING = wearable HRV/sleep/mood; mark `research_grade` if no PSS-10. |

## 4. MCI / cognitive risk

| Field | Status |
|---|---|
| Where computed | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py` emits `cognitive_decline_like` (PAF-driven). |
| Logic kind | hybrid (peak alpha frequency + age context). |
| Input features | spectral.peak_alpha_freq.* + chronological_age. |
| Validated assessment anchor | **MoCA / MMSE** — NOT currently in `_PREFIX_SCORING`. Catalog gap. |
| Confidence / uncertainty present | yes — CI95 + `confidence.level`. Age explicitly contextual driver. |
| Cautions | string disclaimer only. |
| Top contributors | yes. |
| Evidence linkage | none. |
| Gaps | MoCA anchor not consumed; no evidence_refs; out-of-distribution warning needed when chronological_age <40 (PAF interpretation differs). |

## 5. Brain-age

| Field | Status |
|---|---|
| Where computed | qEEG: `packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/brain_age.py:249` (`predict_brain_age`). MRI: `packages/mri-pipeline/src/deepsynaps_mri/models/brain_age.py:66` (owned by MRI stream). |
| Logic kind | model (FCNN when checkpoint present) + stub fallback. |
| Input features | qEEG: per-channel slope, PAF, 5 band relative power. MRI: T1 NIfTI + 3D ResNet (separate stream). |
| Validated assessment anchor | n/a — brain-age has no PROM anchor by design; gap-vs-chronological is the calibration. |
| Confidence / uncertainty present | yes — `confidence` ∈ {low, moderate, high}; gap_percentile. |
| Cautions | none structured. |
| Top contributors | yes — `electrode_importance` (softmax / LRP). |
| Evidence linkage | none. |
| Gaps | (a) range-validate predicted_years (5–95) before surfacing; (b) flag stub vs real (`is_stub` is in payload); (c) no caution when |gap_years| > 10 or chronological_age missing; (d) consume MRI brain-age payload from Stream 2 only, never recompute. |

## 6. Relapse risk

| Field | Status |
|---|---|
| Where computed | NOT computed today as a single score. Closest: `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/longitudinal.py:459` (`generate_trajectory_report`) returns reliable change index + FDR-corrected p-values per feature. |
| Logic kind | n/a (research signal only). |
| Input features | longitudinal qEEG features + change scores; PROMs over time. |
| Validated assessment anchor | none widely validated — typically PHQ-9 / GAD-7 deterioration over time + RCI. |
| Confidence / uncertainty present | partial (RCI + p-value per feature). |
| Cautions | n/a. |
| Top contributors | n/a. |
| Evidence linkage | n/a. |
| Gaps | Score does not exist as a unified output. Will be `research_grade` with confidence ceiling MEDIUM, anchored to PROM trajectory + adverse-event count. |

## 7. Adherence risk

| Field | Status |
|---|---|
| Where computed | `apps/api/app/services/home_device_adherence.py:21` (`compute_adherence_summary`) returns adherence rate, streaks, side effects, open flags. |
| Logic kind | rules (descriptive aggregation). |
| Input features | DeviceSessionLog, PatientAdherenceEvent, HomeDeviceReviewFlag. |
| Validated assessment anchor | none — adherence is observational, not a PROM. |
| Confidence / uncertainty present | none — descriptive only. |
| Cautions | docstring says "descriptive, not clinical". |
| Top contributors | implicit (the rate metric drives it). |
| Evidence linkage | none. |
| Gaps | No standardised score / risk band surfaced. Will be wrapped: high risk when adherence_rate_pct < 50 OR open_flags ≥ 1 OR side_effect_count ≥ 3; tagged `research_grade`; explicit cautions when sessions_expected is None. |

## 8. Response probability

| Field | Status |
|---|---|
| Where computed | NOT directly. `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/protocol_recommender.*` is referenced in `qeeg_ai_bridge.run_recommend_protocol_safe` (off-limits to this stream). DeepTwin engine simulates outcomes (Stream 3, off-limits). |
| Logic kind | n/a in Stream 4. |
| Input features | would consume protocol_recommender output + biomarker similarity. |
| Validated assessment anchor | none widely validated. |
| Confidence / uncertainty present | depends on upstream. |
| Cautions | n/a. |
| Top contributors | n/a. |
| Evidence linkage | n/a. |
| Gaps | Score does not exist as a standardised output. Will be `research_grade`, ceiling MEDIUM, derived from `mdd_like / anxiety_like / cognitive_decline_like` similarity to validated-cohort priors when available, otherwise mark `evidence pending`. NEVER assert a calibrated probability. |

---

## Cross-cutting findings

1. **No unified schema.** Each score has a different shape. Reports / UIs must hand-translate. Phase B introduces `ScoreResponse`.
2. **Validated assessments are catalogued but not wired as PRIMARY anchors.** PHQ-9, GAD-7, HAM-D, HAM-A, BDI-II, ISI, PCL-5, ASRS are scored server-side in `assessment_scoring.py`. PSS-10 / MoCA / MMSE are NOT yet in the catalogue (catalog gap → handoff to Evidence stream).
3. **Confidence taxonomy drift.** qEEG uses `low / moderate / high`; brain-age uses `low / moderate / high`; risk_stratification uses `low / medium / high / no_data`. Phase B normalises to `{low, med, high}` plus `no_data`.
4. **Inputs hash / version not surfaced.** Audit trail for the 8 clinical scores is opaque. Phase B adds `method_provenance.{model_id, version, inputs_hash}` per score.
5. **Evidence refs not linked per score.** Each score should pull 1–3 supporting refs from Evidence stream (or mark "evidence pending"). Phase B exposes the hook.
6. **Diagnostic-vs-decision-support language.** qEEG payload uses "_like" suffix and a strong disclaimer — good. Anywhere we wrap these, we must preserve that hedged language.

---

## OFF-LIMITS confirmed

- `packages/qeeg-pipeline/**` — Stream 1. We CONSUME `risk_scores.py` + `brain_age.py` only.
- `packages/mri-pipeline/**` — Stream 2. We CONSUME the brain-age payload only.
- `apps/api/app/routers/fusion_router.py` — Stream 5/Fusion. Untouched.
- `packages/render-engine/**` and `packages/generation-engine/**` — Stream 5. Untouched.

## Cross-stream handoffs requested

- **Evidence stream**: please add PSS-10, MoCA, MMSE rules to `assessment_scoring._PREFIX_SCORING` so the Stress / MCI scores can anchor.
- **MRI stream**: please surface the brain-age payload via a stable `apps/api/app/services/analyses/mri_*.py` accessor returning `{predicted_years, gap_years, gap_percentile, confidence, is_stub, method_provenance}`. Stream 4 will consume safely.
- **qEEG stream**: no change requested — current `_decision_support_metadata` payload is consumed as-is.
