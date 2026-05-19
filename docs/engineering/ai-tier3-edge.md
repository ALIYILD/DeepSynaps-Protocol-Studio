# Tier 3 — Edge Real-Time qEEG + Edge LLM

Tier 3 runs on in-clinic edge hardware (Apple M2 / Intel i7 / Jetson
TX2). Two models share the runner:

- **EEGNet** (ONNX, ~5k params) — sub-10 ms qEEG screening.
- **BioMistral-7B** quantised to Q5_K_M (~8 GB GGUF) running on
  `llama.cpp` — ~100 ms LLM replies, pure CPU.

Use cases: in-room quick-look screening, clinician-side conversational
helper when the network is degraded or PHI must stay on-device.

## Status: stub

- Service: `apps/api/app/services/ai/tier3_edge/`
- Router: `/api/v1/ai/tier3/*`
- 7 tests pass locally
- No ONNX runtime / llama.cpp dependency added in this PR

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/tier3/health`       | any auth    |
| POST   | `/api/v1/ai/tier3/screen`       | clinician+  |
| POST   | `/api/v1/ai/tier3/chat`         | clinician+  |

## Configuration

| Variable                       | Default | Purpose                                   |
|--------------------------------|---------|-------------------------------------------|
| `TIER3_EEGNET_PATH`            | unset   | EEGNet ONNX weight path.                  |
| `TIER3_LLAMACPP_MODEL_PATH`    | unset   | BioMistral-7B GGUF (Q5_K_M).              |
| `TIER3_DEVICE`                 | `cpu`   | `cpu` / `cuda:0` / `metal`.               |

## Follow-up

1. Add `onnxruntime` + `llama-cpp-python` to a `[edge]` extra so cloud
   deploys don't ship the GGUF runtime by default.
2. Wire EEGNet inference (decode `signal_b64`, run, return score).
3. Wire `llama.cpp` chat path with strict max-token caps.
4. Stand up the edge image: docker-compose with both runtimes.
5. Anti-leakage policy: PHI never leaves edge unless the cloud LLM is
   explicitly invoked by the clinician.

## Upstream

- BioMistral: <https://huggingface.co/BioMistral/BioMistral-7B>
- llama.cpp: <https://github.com/ggerganov/llama.cpp>
- EEGNet: <https://github.com/vlawhern/arl-eegmodels>

Phase 3 — Phase A / edge deployment lane.
