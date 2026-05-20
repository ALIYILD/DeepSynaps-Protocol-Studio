# Tier 2 — qEEG Inference (EEGNet + BIOT)

Tier 2 of the three-tier DeepSynaps AI architecture. Hosts low-level qEEG
inference behind an ONNX Runtime adapter. Two target models:

| Model    | Params  | Target latency | Upstream                                                      |
|----------|---------|----------------|---------------------------------------------------------------|
| EEGNet   | ~5 k    | <1 ms (CPU)    | <https://github.com/vlawhern/arl-eegmodels> (Apache 2.0)      |
| BIOT     | 3.3 M   | ~10 ms (GPU)   | <https://github.com/ycq091044/BIOT> (Apache 2.0)              |

This adapter sits **below** the existing `qeeg_ai_router` — its job is the
raw inference call; higher-level qEEG pipelines (`packages/qeeg-pipeline`,
`qeeg_report_template`) will delegate to it once weights are wired.

## Status: stub

This PR ships the contract only:

- Service package `apps/api/app/services/ai/tier2_qeeg/`
- Router `apps/api/app/routers/ai_tier2_qeeg_router.py` mounted at `/api/v1/ai/qeeg`
- Schemas, model registry, canonical disclaimer
- Stub `OnnxRunner` that returns `stub: True, predictions: None` on every call
- 6 tests covering health, registry, role gating, schema validation, OpenAPI registration

**No ONNX weights are downloaded or loaded. ``onnxruntime`` is not added
as a dependency in this PR.**

## Endpoints

| Method | Path                       | Role        | Notes                                |
|--------|----------------------------|-------------|--------------------------------------|
| GET    | `/api/v1/ai/qeeg/health`   | any auth    | Reports stub status.                 |
| GET    | `/api/v1/ai/qeeg/models`   | any auth    | Registry metadata only.              |
| POST   | `/api/v1/ai/qeeg/infer`    | clinician+  | Returns stub envelope with disclaimer. |

Every inference response carries
`disclaimer = "AI-derived qEEG output. Requires clinician interpretation. Not a diagnosis."`

## Configuration

Read from environment at process start:

| Variable                  | Default | Purpose                                         |
|---------------------------|---------|-------------------------------------------------|
| `QEEG_ONNX_MODELS_DIR`    | unset   | Directory holding `.onnx` weight files.         |
| `QEEG_RUNTIME_PROVIDER`   | `cpu`   | Execution provider: `cpu` / `cuda` / `tensorrt`.|

While `QEEG_ONNX_MODELS_DIR` is unset, every `/infer` call returns stub.

## Follow-up work (not in this PR)

1. **Add ``onnxruntime`` dependency.** Add to `apps/api/pyproject.toml`
   (CPU build); document optional `onnxruntime-gpu` extra for CUDA deploys.
2. **Wire weight resolution.** Pre-trained EEGNet + BIOT ONNX files
   land at `${QEEG_ONNX_MODELS_DIR}/eegnet.onnx` and `biot.onnx`. Add a
   loader that lazy-creates `InferenceSession` per model with the
   configured execution provider.
3. **Signal decoder.** Decode `signal_b64` → float32 numpy array, reshape
   to `signal_shape`, validate against the model's expected `input_shape`
   from `model_registry`.
4. **Benchmark.** Verify CPU latency for EEGNet matches <1ms target;
   GPU latency for BIOT matches ~10ms.
5. **Delegate from `qeeg_ai_router`.** Once weights ship, route the
   higher-level qEEG endpoints through this adapter.
6. **Reference pre-trained sources:**
   - Braindecode model hub: <https://huggingface.co/Braindecode>
   - BIOT release weights: <https://github.com/ycq091044/BIOT/releases>
   - EEGNet ONNX export script: derive from `arl-eegmodels` repo.

## Phase 3 context

This is Tier 2 of 3 in the DeepSynaps AI roadmap. Tier 1 (cloud LLM) and
Tier 2 MRI (FastSurfer pipeline) ship in sibling PRs.
