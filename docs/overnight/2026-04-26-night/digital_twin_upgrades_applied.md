# DeepTwin — upgrades applied (Stream 3, night 2026-04-26)

All changes are decision-support oriented. We did not invent calibration
data or fake learned-model behaviour. The engine remains rule-based and
RNG-seeded; what changed is the **transparency, attribution, language,
provenance, and contract** around its outputs, plus a new
scenario-comparison endpoint.

## Files touched (in scope only)

| File | Change |
|---|---|
| `apps/api/app/services/deeptwin_decision_support.py` | NEW. 326 lines. Centralises confidence_tier(), derive_top_drivers(), soften_language(), build_provenance(), build_uncertainty_block(), build_calibration_status(), build_scenario_comparison(). |
| `apps/api/app/services/deeptwin_engine.py` | Imports the new helpers. `estimate_trajectory()` (lines ~362-444) now returns confidence_tier, top_drivers, calibration, 3-component uncertainty, enriched provenance with model_id+schema+inputs_hash, decision_support_only=True, softened rationale. `simulate_intervention_scenario()` (lines ~440-680) gains the same enrichment plus patient_specific_notes, scenario_comparison stub, evidence_status enum, schema_version field; back-compat preserved by keeping legacy `provenance.inputs` and `provenance.scenario_id`, plus `feature_attribution` alias for `top_drivers`. |
| `apps/api/app/routers/deeptwin_router.py` | Imports the new helpers. `_build_prediction()` (line ~298) and `_build_simulation_outputs()` (line ~456) emit confidence_tier, top_drivers, calibration, uncertainty, scenario_comparison, evidence_status, decision_support_only. `DeeptwinAnalyzeResponse` and `DeeptwinSimulateResponse` gain top-level provenance + schema_version + decision_support_only. `TwinPredictionOut` and `TwinSimulationOut` Pydantic models extended with the new fields (back-compat: every new field has a default, so old callers do not break). NEW endpoint `POST /patients/{pid}/scenarios/compare` (lines ~931-985) returns structured deltas across N scenarios. |
| `apps/api/tests/test_deeptwin_router.py` | 9 new tests added (see `prediction_tests_added.md`). |
| `apps/web/src/deeptwin/safety.js` | Adds `confidenceTierChip()`, `topDriversList()`, `evidenceStatusChip()`, `decisionSupportBanner()`. |
| `apps/web/src/deeptwin/components.js` | `renderPrediction()` now shows tier + evidence-status chips, top-driver list, calibration note. `renderSimulationDetail()` rebuilt to show tier, evidence chip, rationale, top-driver list, CI95, calibration note, patient-specific notes, expandable provenance block; safety stamps preserved. |
| `apps/web/src/pages-deeptwin.js` | Imports + renders `decisionSupportBanner()` at top of every state (loaded, loading, empty, error). No new dead buttons; existing scenario-compare in-page UI continues to work and now also has a backend equivalent ready to wire (deferred — out of tonight scope). |

## Files reviewed but NOT touched (per scope rules)

- `packages/qeeg-pipeline/`, `packages/mri-pipeline/` — OFF-LIMITS.
- `packages/feature-store/` — OFF-LIMITS.
- `apps/api/app/routers/fusion_router.py` — OFF-LIMITS.
- `deepsynaps_brain_twin_kit/` — read-only audit; this is a spec/docs
  directory, not active twin code.
- `apps/web/src/pages-brain-twin.js` — separate page; explicitly
  off-limits per task brief.
- `apps/worker/app/deeptwin_simulation.py` — touched indirectly only
  through reading; the simulator stub there continues to work and
  the gate test still passes. We did not modify worker code because
  the changes wanted today were on the API surface.

## Acceptance criteria (Stream 3) — status

| Criterion | Status | Notes |
|---|---|---|
| Simulation accepts qEEG/MRI + treatment scenario | partial | API accepts the modality flags; no actual feature payload yet (see audit A1, blocked by feature-store/qeeg/mri stream coordination — DevOps + cross-stream handoff required). |
| Outputs include prediction + uncertainty bands | yes | now 3-component, honestly labelled. |
| Scenario eviction (notify user) | yes | client-side (limit 3 in `pages-deeptwin.js` line 216 — note brief mentioned 100, the actual cap on this UI is 3; documented in audit A3). |
| Simulation timeout 30s graceful | yes | `pages-deeptwin.js` line 209 `Promise.race` — preserved. |
| Handoff requires explicit user confirmation | yes | `_wireHandoffButtons` `window.confirm()` — preserved. |
| All 3 uncertainty methods documented | yes (as honest stubs) | epistemic / aleatoric / calibration each present in payload with `status: unavailable | uncalibrated`, method name, note. We did NOT fabricate numbers. |

## Cross-stream handoffs

- **qEEG + MRI streams:** the twin currently consumes only modality-presence
  flags, not actual features. Wiring the feature-store output into
  `_build_prediction` and `simulate_intervention_scenario` would deliver
  on audit finding A1 (no real feature plumbing). This requires
  collaborative work across streams 1, 2, 3 and is intentionally
  deferred.
- **Risk/Scoring stream:** twin's `evidence_status` enum mirrors the
  shape we recommend Risk/Scoring also adopt (`linked` / `pending` /
  `unavailable`) — coordinate before merge.
- **Evidence/Reports stream:** report builders in `deeptwin_engine.py`
  still emit `evidence_grade` only. If reports stream wants to render
  per-recommendation evidence_status they can read `evidence_status`
  off the same payloads now.
- **QA stream:** new `/scenarios/compare` endpoint should be added to
  the integration smoke test alongside `/simulations`.

## Safety / governance posture

- Decision-support banner on every page state (loaded/loading/empty/error).
- All recommendation summaries pass through `soften_language()`. Forbidden terms (`diagnose`, `prescribe`, `guarantee`, `should take`, `cures`, `definitely`, `must take`, `will heal`) trigger a full sentence rewrite.
- Calibration honestly disclosed as `uncalibrated` at top-level on every prediction/simulation. We do NOT report fake calibrated probabilities.
- Provenance now includes `model_id`, `model_version`, `schema_version`, `inputs_hash` — required for EU AI Act + FDA SaMD audit traceability.
- `decision_support_only: True` exposed as a top-level boolean on every payload so the UI cannot accidentally drop the safety stamp.

## Test result summary

```
pytest apps/api/tests/test_deeptwin_router.py -v 2>&1 | tail -50
=== 21 passed, 1 warning in 6.54s ===

(combined router + engine + provenance + gate suites: 50 passed)
```

## Not done tonight (deferred / out of scope)

- Real calibration training / Platt or isotonic — needs an outcome cohort.
- Real top-driver attribution via SHAP — needs a learned model.
- Server-side scenario persistence + 100-cap eviction. Client-side cap is 3 today; brief expected 100; this needs DB schema work (DevOps blocker — not stream-3 alone).
- Wire `packages/qeeg-encoder/conformal/` into twin predictions — would cross OFF-LIMITS boundary into qEEG stream.
- Worker job changes — `apps/worker/app/deeptwin_simulation.py` was reviewed and untouched; existing gate test still passes.

## DevOps blockers

- None for tonight's changes (no new dependencies, no migrations).
- For future calibration work: requires shared outcome-cohort dataset and at least one trained model — coordinate with PerfFlux GPU resources.
