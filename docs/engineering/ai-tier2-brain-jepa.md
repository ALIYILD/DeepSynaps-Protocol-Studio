# Tier 2 — Brain-JEPA fMRI Foundation Model

Brain-JEPA is a self-supervised fMRI foundation model — current SOTA on
generic fMRI representation tasks. The DeepSynaps adapter exposes a
single `embed` call: given a resting-state fMRI volume, return a learned
representation that downstream task heads (TMS targeting, response
prediction, connectivity analysis) can fine-tune against.

## Status: stub

- Service: `apps/api/app/services/ai/tier2_brain_jepa/`
- Router: `/api/v1/ai/brain-jepa/*`
- 5 tests pass locally
- No checkpoint loaded, no torch import in this PR

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/brain-jepa/health`  | any auth    |
| POST   | `/api/v1/ai/brain-jepa/embed`   | clinician+  |

## Configuration

| Variable                  | Default | Purpose                                   |
|---------------------------|---------|-------------------------------------------|
| `BRAIN_JEPA_MODEL_PATH`   | unset   | Local path or HF id of the checkpoint.    |
| `BRAIN_JEPA_DEVICE`       | `cpu`   | Inference device (`cpu` / `cuda:0`).      |

## Follow-up

1. Wire torch + the Brain-JEPA architecture (sibling fMRI ViT).
2. Add NIfTI loader + temporal patching.
3. Return real embedding + `embedding_dim`.
4. Benchmark CPU vs GPU latency.
5. Promote env vars to `AppSettings`.

## Upstream

- Brain-JEPA: <https://github.com/zhangzeng-13/Brain-JEPA>

Phase 3 — Phase B Month 2-3.
