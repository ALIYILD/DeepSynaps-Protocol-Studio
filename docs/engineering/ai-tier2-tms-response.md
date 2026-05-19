# Tier 2 — TMS Response Predictor (Multimodal MRI Ensemble)

Predicts pre-treatment whether a depression patient will respond to a
standard rTMS course. Reference cohort reports AUC 0.932 using a
multimodal MRI ensemble (structural + functional features).

## Status: stub

- Service: `apps/api/app/services/ai/tier2_tms_response/`
- Router: `/api/v1/ai/tms-response/*`
- 4 tests pass locally
- No ensemble loaded, no probability fabricated, no feature attribution

## Endpoints

| Method | Path                              | Role        |
|--------|-----------------------------------|-------------|
| GET    | `/api/v1/ai/tms-response/health`    | any auth    |
| POST   | `/api/v1/ai/tms-response/predict`   | clinician+  |

## Configuration

| Variable                       | Default | Purpose                         |
|--------------------------------|---------|---------------------------------|
| `TMS_RESPONSE_MODEL_PATH`      | unset   | Path to ensemble checkpoint.    |

## Follow-up

1. Wire structural-MRI encoder (FastSurfer features) + fMRI encoder
   (Brain-JEPA embedding).
2. Stack into an ensemble classifier (LightGBM over concatenated
   embeddings + clinical features).
3. Return real `predicted_response_probability` + per-feature SHAP
   `feature_attribution`.
4. Validate AUC against the 0.932 reference in our cohort.
5. Cross-clinic gate.
6. **First-in-world claim** — verify before any marketing copy lands.

Phase 3 — Phase C 6-12 month.
