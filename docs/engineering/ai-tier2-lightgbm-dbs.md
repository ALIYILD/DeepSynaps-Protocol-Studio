# Tier 2 — LightGBM DBS Motor-Outcome Predictor

Predicts post-operative UPDRS-III motor improvement (%) from
pre-operative clinical features for candidates considered for deep
brain stimulation. Reference cohort reported AUC 0.921.

## Status: stub

- Service: `apps/api/app/services/ai/tier2_lightgbm_dbs/`
- Router: `/api/v1/ai/dbs-predict/*`
- 4 tests pass locally
- No `lightgbm` import, no model loaded, no fake probability returned

## Endpoints

| Method | Path                              | Role        |
|--------|-----------------------------------|-------------|
| GET    | `/api/v1/ai/dbs-predict/health`     | any auth    |
| POST   | `/api/v1/ai/dbs-predict/predict`    | clinician+  |

## Configuration

| Variable        | Default | Purpose                              |
|-----------------|---------|--------------------------------------|
| `DBS_MODEL_PATH`| unset   | Path to serialised LightGBM booster. |

## Follow-up

1. Add `lightgbm` to dependency surface.
2. Define the canonical feature list (UPDRS-III subscores, LEDD, disease
   duration, asymmetry index, age, etc.) and validate input.
3. Load booster, return real `predicted_motor_improvement_pct`.
4. Validate AUC on our cohort against the 0.921 reference.
5. Surface feature importances for clinician review.
6. Cross-clinic gate.

Phase 3 — Phase B Month 2-3.
