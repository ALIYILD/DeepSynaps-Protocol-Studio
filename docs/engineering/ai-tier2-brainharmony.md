# Tier 2 — BrainHarmony Structure-Function Fusion

BrainHarmony fuses structural MRI and resting-state fMRI into a single
shared representation (multimodal sMRI+fMRI foundation model).
Downstream task heads (TMS response, DBS outcome, biomarker discovery)
fine-tune against the fused features.

## Status: stub

- Service: `apps/api/app/services/ai/tier2_brainharmony/`
- Router: `/api/v1/ai/brainharmony/*`
- 4 tests pass locally
- No checkpoint loaded, no torch import in this PR

## Endpoints

| Method | Path                              | Role        |
|--------|-----------------------------------|-------------|
| GET    | `/api/v1/ai/brainharmony/health`    | any auth    |
| POST   | `/api/v1/ai/brainharmony/fuse`      | clinician+  |

## Configuration

| Variable                    | Default | Purpose                               |
|-----------------------------|---------|---------------------------------------|
| `BRAINHARMONY_MODEL_PATH`   | unset   | Path / HF id of the fusion ckpt.      |
| `BRAINHARMONY_DEVICE`       | `cpu`   | Inference device.                     |

## Follow-up

1. Wire torch + the BrainHarmony cross-modal architecture.
2. Decode NIfTI + temporal patching for fMRI.
3. Return real `fused_features` + `feature_dim`.
4. Compare against single-modality baselines (FastSurfer-only,
   Brain-JEPA-only) on the same downstream tasks.

Phase 3 — Phase C 6-12 month.
