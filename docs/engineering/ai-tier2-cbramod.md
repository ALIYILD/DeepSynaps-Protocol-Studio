# Tier 2 — CBraMod EEG Foundation Model

CBraMod is an EEG foundation model with SOTA performance across 10 BCI
benchmarks. The DeepSynaps adapter exposes a single `embed` call: given
a raw EEG segment, return a learned representation downstream task
heads (motor-imagery decoding, sleep staging, depression screening)
can fine-tune against.

## Status: stub

- Service: `apps/api/app/services/ai/tier2_cbramod/`
- Router: `/api/v1/ai/cbramod/*`
- 4 tests pass locally
- No checkpoint loaded, no torch import

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/cbramod/health`     | any auth    |
| POST   | `/api/v1/ai/cbramod/embed`      | clinician+  |

## Configuration

| Variable                | Default | Purpose                                   |
|-------------------------|---------|-------------------------------------------|
| `CBRAMOD_MODEL_PATH`    | unset   | Local path or HF id of the checkpoint.    |
| `CBRAMOD_DEVICE`        | `cpu`   | Inference device.                         |

## Follow-up

1. Add torch + CBraMod architecture (criss-cross transformer).
2. Decode `signal_b64` to float32 (channels × samples).
3. Validate channel labels against 10-20 montage.
4. Return real embedding + `embedding_dim`.
5. Bench vs target tasks.

## Upstream

- CBraMod: <https://github.com/wjq-learning/CBraMod>

Phase 3 — Phase B Month 2-3.
