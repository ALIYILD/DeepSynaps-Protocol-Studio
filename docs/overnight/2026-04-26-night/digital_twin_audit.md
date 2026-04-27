# DeepTwin (Digital Twin) Audit — 2026-04-26 Night Shift

Auditor: Stream 3 / Digital Twin Specialist
Repo paths audited (read-only):
- `apps/api/app/routers/deeptwin_router.py` (971 lines)
- `apps/api/app/services/deeptwin_engine.py` (813 lines)
- `apps/api/app/services/deeptwin_research_loop.py` (108 lines, DISABLED)
- `apps/worker/app/deeptwin_simulation.py` (107 lines)
- `apps/web/src/pages-deeptwin.js` (328 lines)
- `apps/web/src/deeptwin/{components,safety,service,handoff,reports,charts,mockData,sim-room}.js`
- `apps/api/tests/test_deeptwin_router.py`, `test_deeptwin_engine.py`,
  `test_deeptwin_engine_provenance.py`, `test_deeptwin_simulation_gate.py`
- `deepsynaps_brain_twin_kit/docs/*` (architecture spec) — informational only

---

## A1. Inputs

| Input | Where it enters | Used by | Notes |
|---|---|---|---|
| `patient_id` | path param + body on every endpoint | All twin functions, used as RNG seed via `_seed()` / `_stable_seed()` | Same patient → same outputs (determinism guaranteed) |
| `modalities[]` (qeeg_features, qeeg_raw, mri_structural, fmri, wearables, in_clinic_therapy, home_therapy, video, audio, assessments, ehr_text) | `/analyze`, `/simulate`, `/evidence` body | `_modality_coverage()`, `_safe_weights()`, fusion bonus terms | qEEG/MRI payloads themselves are NOT consumed — only the **list of which modalities are present**; this is selection, not actual feature ingestion |
| `combine` + `custom_weights` | `/analyze` body | `_safe_weights()` | Weights normalize to sum 1; on bad input falls back to uniform |
| `analysis_modes[]` (correlation/prediction/causation) | `/analyze` body | gates which sub-block is built | Default `["prediction"]` |
| `protocol_id`, `horizon_days`, `scenario` (sessions/day, sessions/week, weeks, frequency_hz, expected_biomarker, target, clinical_goal, intervention_type) | `/simulate` body | `_build_simulation_outputs()` | Only `scenario` keys above are read; everything else ignored |
| Twin v1 `TwinSimulationRequest` (modality, target, frequency_hz, current_ma, power_w, duration_min, sessions_per_week, weeks, contraindications, adherence_assumption_pct, notes) | `/patients/{pid}/simulations` body | `simulate_intervention_scenario()` | Richer than legacy `/simulate`; produces curve+CI |
| `question`, `ranking_mode`, `limit` | `/evidence` body | `search_ranked_papers()` from neuromodulation bundle | Snapshot ID derived from `bundle_root_or_none()`; if no bundle → empty payload + warning |
| `assessments` data | NOT actually read | Only the **mention** of `assessments` in `modalities[]` shifts a coverage ratio | True PHQ-9 / ASRS values are synthesized in `_SIGNAL_SPECS` from RNG, not loaded |
| qEEG payload | NOT actually read | Only modality flag changes weights | Same as above — true qEEG features never enter the twin engine |
| MRI payload | NOT actually read | Only modality flag changes weights | Same as above |

**Finding A1 (critical):** the twin treats inputs as *flags* (which modalities are connected), not as *features*. There is no real feature plumbing from `qeeg_pipeline` / `mri_pipeline` / `feature_store` into the twin reasoner. Every numeric output is RNG-seeded by `patient_id`. The provenance block already self-discloses this via `mode: "deterministic_demo"` — this is honest, but the field is not surfaced in the UI today.

## A2. Treatment ranking logic — rules vs model vs hybrid

- `/analyze` ranking via `_build_priority_pairs()` (router lines 212-276):
  rule-driven seeded correlation matrix; pairs are pre-templated with
  hand-written `clinical_readout` strings; sorted by abs score.
- `/simulate` curve via `_build_simulation_outputs()` (lines 427-507):
  closed-form formula `effect_size = clip(0.14 + dose_score*0.32 + N(0,0.03))`
  where `dose_score` is a hand-tuned combo of sessions/week × weeks × frequency.
- v1 `simulate_intervention_scenario()` (engine lines 440-603):
  per-modality drift table (hard-coded dict literal, lines 461-464);
  drift scaled by `adherence_assumption_pct/80`; CI is a deterministic band
  widening with horizon (`band = 0.6 + d*0.012`).

**Finding A2:** Pure rule-based + RNG. No trained model in the loop. **Reproducible: yes** (deterministic, seeded). Ranking transparency is partial — `clinical_readout` strings exist but per-recommendation top-driver attribution is shallow (only `feature_attribution[]` in v1 simulate; `/analyze` predictions have no per-prediction driver list).

## A3. Scenario simulation

- v1 simulate (`/patients/{pid}/simulations`) returns `predicted_curve`, `responder_probability` (+ CI95), `safety_concerns`, `feature_attribution`, `provenance`.
- Scenarios are **stored client-side only** in `pages-deeptwin.js` `STATE.scenarios` (line 76) — not persisted server-side. Limit is **3** (line 216) on the React state — *the task brief mentions "100-cap"; the actual cap on the page is 3*. Frontend evicts oldest with toast: `_showToast('Comparison limit is 3. Oldest scenario removed.')`.
- Comparison: `mountSimulation(HOST_SIM, scenarios)` overlays curves; no structured delta payload returned by API.

**Finding A3:** No server-side scenario persistence, no cross-session continuity, no comparison summary object. Eviction works (good) but limit mismatch with brief docs. **Comparison output today is a chart only**, not a structured delta object.

## A4. Personalization — features → outputs

- Patient-specific binding is via `_seed(patient_id, salt)` only.
- No feature-store call. No qEEG metric handoff to the simulator.
- Recommendation/rationale strings in `_build_prediction()` are mostly generic ("Best current use is treatment-readiness ranking…") with one or two if-branches on which modality flags were sent.

**Finding A4:** Personalization is **nominal** — outputs differ across patients only via RNG seed, not via actual patient features. This is honest in the `provenance.mode` field but is not visible to clinicians at recommendation level.

## A5. Calibration

- No calibration set, no Platt scaling, no isotonic regression, no conformal layer wired in.
- `provenance.calibration_status: "illustrative_not_clinically_calibrated"` is set in `estimate_trajectory` and `simulate_intervention_scenario` (engine lines 416, 590) — honest disclosure.
- `responder_probability_ci95` exists but is a fixed ±0.18 band, not data-derived.

**Finding A5:** **Uncalibrated.** Disclosure exists in provenance but is not propagated into the API top-level fields nor surfaced in the UI today. The risk: a clinician reading `responder_probability=0.62` may assume it is a calibrated probability.

## A6. Uncertainty — epistemic / aleatoric / calibration

- Single uncertainty source: deterministic CI band (`band = 0.6 + d*0.012`, scenario; `abs(baseline)*0.04 + 0.5 + d*abs(baseline)*0.0008`, trajectory).
- No MC dropout, no ensembling, no conformal prediction (despite `qeeg-encoder/conformal/` existing in the repo per repo_map line 124).
- `uncertainty.method = "deterministic_scenario_band"` is honest.
- Width grows monotonically with horizon (test asserts this — `test_prediction_uncertainty_widens_with_horizon`).

**Finding A6:** Only **one** uncertainty channel and it is structural, not statistical. The Stream 3 acceptance criterion ("All 3 uncertainty methods (epistemic/aleatoric/calibration) documented") is **not met** in code today. We can document and stub them; we cannot honestly compute them tonight without training data + model runs.

## A7. Recommendation explanations / top drivers

- v1 simulate has `feature_attribution[]` with 4 hard-coded items
  (protocol_class / target / adherence_assumption_pct / contraindications) —
  same 4 for **every** patient.
- `/analyze` `key_predictions[].why` exists but is generic copy.
- Causation card has `evidence_for[]` / `evidence_against[]` — solid shape but
  hard-coded text.

**Finding A7:** Top-driver shape exists in 1 of 6 surfaces. Needs to be added consistently to every recommendation, with at least patient-modality-derived driver labels even if magnitudes are heuristic.

## A8. Evidence support per recommendation

- `/evidence` endpoint exists, separate flow.
- `simulate_intervention_scenario.evidence_support[]` returns 2 generic strings
  ("Within-patient baseline + cohort literature.", "See Evidence panel for cited papers.").
- No DOI / PMID-level link from recommendation row to evidence row.

**Finding A8:** Evidence support is named in the payload, but **not bound** to a specific recommendation. Needs at least a `evidence_status` enum (linked / pending / unavailable) per item.

## A9. Provenance — model id, version, inputs hash, timestamp

- v1 sim provenance (engine lines 575-591) has: engine, mode, scenario_id, inputs (subset), seed_salt, generated_at, calibration_status. **Missing: schema_version, inputs_hash, model_id (`deeptwin_engine` is the file, not a model).**
- Trajectory provenance (engine lines 410-417) has: engine, mode, seed_salt, generated_at, inputs_used, calibration_status. **Missing: schema_version, inputs_hash.**
- Legacy `/simulate` and `/analyze` have NO provenance block at all.

**Finding A9:** Partial. Two surfaces have it; four don't. No inputs hash. No schema/contract version. No `model_id` distinct from engine name.

---

## Summary of gaps (do-tonight ranked)

| # | Gap | Surface | Impact | Effort |
|---|---|---|---|---|
| 1 | Recommendations lack confidence tier | every recommendation row | clinicians can't sort by trust | small |
| 2 | Top drivers missing on 5 of 6 surfaces | `/analyze.prediction`, `/predictions`, simulate, etc. | no transparency | medium |
| 3 | No scenario comparison object | client-only overlay | can't audit deltas | small |
| 4 | Recommendation language too assertive | various `summary` strings | safety risk | small |
| 5 | No `schema_version`, `inputs_hash` in provenance | all responses | reproducibility audit broken | small |
| 6 | UI has no per-rec rationale + footer banner | `pages-deeptwin.js` | clinicians don't see safety context | small |
| 7 | Calibration not surfaced at top-level | every prediction | implicit overclaim | small |
| 8 | Uncertainty methods not documented in API contract | every prediction | acceptance criterion miss | small |
