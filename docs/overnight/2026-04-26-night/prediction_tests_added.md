# DeepTwin — prediction tests added (Stream 3, night 2026-04-26)

Test file: `apps/api/tests/test_deeptwin_router.py`

## New tests

| # | Test name | What it covers |
|---|---|---|
| 1 | `test_v1_simulation_response_has_decision_support_contract` | `/patients/{pid}/simulations` payload has `confidence_tier in {high, medium, low}`, `top_drivers >= 1` (each with `factor/magnitude in [0,1]/direction in {positive,negative,neutral}`), provenance with `model_id`, `schema_version`, `inputs_hash` (sha256 prefix), 3-component uncertainty (epistemic/aleatoric/calibration), calibration disclosed as uncalibrated, scenario_comparison shape (`delta_pred`, `expected_direction`), patient-specific notes, evidence_status enum, `decision_support_only=True`. |
| 2 | `test_v1_predictions_have_confidence_and_drivers` | `/patients/{pid}/predictions` enriched with confidence_tier, top_drivers, calibration, 3-component uncertainty, provenance, evidence_status. |
| 3 | `test_legacy_analyze_response_has_provenance_and_softened_language` | `/analyze` carries top-level `schema_version`, `provenance.model_id`, `provenance.inputs_hash`. Each `key_predictions[]` entry carries confidence_tier, top_drivers, evidence_status. Verifies softener: no forbidden terms (`diagnose`, `prescribe`, `guarantee`, `should take`) appear in summaries. |
| 4 | `test_legacy_simulate_response_has_provenance_and_decision_support` | Legacy `/simulate` payload: outputs.confidence_tier, top_drivers, calibration, uncertainty.components, scenario_comparison.delta_pred, top-level provenance + schema_version + decision_support_only. |
| 5 | `test_scenario_comparison_endpoint` | New `/patients/{pid}/scenarios/compare` returns deltas across N scenarios; modality-change → recommendation_changed True; carries schema_version + provenance. |
| 6 | `test_scenario_comparison_handles_empty_input` | Empty scenarios list → count=0, items=[], deltas=[] without error. |
| 7 | `test_scenario_compare_requires_clinician` | RBAC: patient role rejected with 403 / `insufficient_role`. |
| 8 | `test_simulate_disabled_returns_503_with_provenance` | Confirms feature-gate path still returns 503 with `deeptwin_simulation_disabled` (existing F6 contract preserved). |
| 9 | `test_handoff_confirmation_guard_returns_audit_ref` | Handoff endpoint returns audit_ref + approval_required + decision-support disclaimer (UI confirm dialog has something to log). |

## Pre-existing tests that continue to pass

All 12 pre-existing router tests + 17 engine tests + 8 simulation-gate tests
+ 1 provenance test continue to pass after engine refactor. `test_simulation_includes_auditable_provenance_and_attribution`
verified explicitly — back-compat preserved by passing the readable
inputs subset alongside the new `inputs_hash`.

## Test command + result

```
pytest apps/api/tests/test_deeptwin_router.py -v 2>&1 | tail -50
```

```
========================== test session starts ==========================
collected 21 items

test_deeptwin_analyze_returns_ranked_workspace_outputs              PASSED [  4%]
test_deeptwin_simulate_returns_forecast_biomarkers_and_monitoring_plan PASSED [  9%]
test_summary_endpoint                                                PASSED [ 14%]
test_timeline_endpoint                                               PASSED [ 19%]
test_signals_endpoint                                                PASSED [ 23%]
test_correlations_endpoint_has_warning                               PASSED [ 28%]
test_predictions_horizons                                            PASSED [ 33%]
test_simulation_endpoint_requires_approval                           PASSED [ 38%]
test_report_endpoint                                                 PASSED [ 42%]
test_agent_handoff_endpoint                                          PASSED [ 47%]
test_deeptwin_patient_routes_require_clinician_role                  PASSED [ 52%]
test_deeptwin_simulate_requires_clinician_role                       PASSED [ 57%]
test_v1_simulation_response_has_decision_support_contract            PASSED [ 61%]
test_v1_predictions_have_confidence_and_drivers                      PASSED [ 66%]
test_legacy_analyze_response_has_provenance_and_softened_language    PASSED [ 71%]
test_legacy_simulate_response_has_provenance_and_decision_support    PASSED [ 76%]
test_scenario_comparison_endpoint                                    PASSED [ 80%]
test_scenario_comparison_handles_empty_input                         PASSED [ 85%]
test_scenario_compare_requires_clinician                             PASSED [ 90%]
test_simulate_disabled_returns_503_with_provenance                   PASSED [ 95%]
test_handoff_confirmation_guard_returns_audit_ref                    PASSED [100%]

========================== 21 passed, 1 warning in 6.54s ==========================
```

Combined deeptwin suite (router + engine + provenance + gate):
**50 passed, 1 warning in 12.35s**.

## Coverage gaps not closed tonight (handoff to QA)

- Server-side scenario persistence — out of stream-3 scope (DB migration).
- Frontend Plotly mount tests — Stream 6 / QA Playwright work.
- Real calibration test against an outcome cohort — needs cross-stream
  data work (qEEG + risk + outcomes), should not be done in stream-3
  without breaking OFF-LIMITS rule.
- Wire-up test that proves the qEEG→twin feature path actually runs —
  blocked because the path does not exist yet (audit finding A1).
