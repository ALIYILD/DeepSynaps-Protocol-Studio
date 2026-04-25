# qEEG Encoder — Brain Twin modality service

Reference implementation of a Brain Twin modality encoder. Consumes `studio.qeeg-recording.v1` and `studio.qeeg-features.v1` Avro events, produces a 512-dim foundation embedding plus a 128-dim tabular embedding, wraps predictive heads in MAPIE conformal intervals, pushes features to Feast, and emits `studio.ai-inference.v1` events.

This is the **template** for the other 5 modality encoders (MRI, wearables, video, audio, text). Same shape, same contracts.

## Hard rules

- Decision-support only. No autonomous prescribing.
- Foundation-model weights mounted from `/opt/models/` — never bundled in the image.
- License lock: `configs/models.lock.yaml` enforced in CI. CC BY-NC weights rejected. TRIBE v2 banned.
- Conformal intervals on every predictive output. Coverage target 90%.
- Tenant scoping enforced on every read and write.
- consent_version on every emitted event.

## Architecture

```
┌───────────────────────┐
│ studio.qeeg-recording │──┐
│ studio.qeeg-features  │──┼──► AvroConsumer ──► QEEGEncoder.forward()
└───────────────────────┘  │                         │
                           │                         ├─► Foundation path (LaBraM/EEGPT, 512-dim)
                           │                         ├─► Tabular path (sklearn, 128-dim)
                           │                         └─► ConformalWrapper (MAPIE)
                           │                              │
                           │                              ├─► Feast push  (qeeg_session_features)
                           │                              └─► AIInferenceEmitter ──► studio.ai-inference.v1
```

## Package layout

```
src/qeeg_encoder/
├── config.py                 # Pydantic Settings — env-driven
├── cli.py                    # qeeg-encoder CLI
├── encoder.py                # QEEGEncoder facade
├── foundation/
│   ├── loader.py             # Mounted-weights loader with SHA256 verify
│   └── labram.py             # LaBraM / EEGPT wrapper (frozen)
├── tabular/
│   ├── features.py           # Canonical qEEG feature extraction
│   └── projector.py          # 128-dim sklearn projection
├── conformal/
│   └── wrapper.py            # MAPIE wrapper for predictive heads
├── bus/
│   ├── envelope.py           # Universal event envelope (Pydantic)
│   ├── consumer.py           # aiokafka Avro consumer
│   └── schema_registry.py    # Confluent Schema Registry client
├── features/
│   └── pusher.py             # Feast push API client
├── emit/
│   └── ai_inference.py       # ai_inference event emitter
└── licensing/
    └── lockcheck.py          # models.lock.yaml CI check

configs/
├── default.yaml              # Default runtime config
└── models.lock.yaml          # Pinned model weights + licenses

models/
└── README.md                 # How to mount foundation weights

docker/
├── Dockerfile
└── docker-compose.dev.yml    # Local dev: Redpanda + Schema Registry + Redis + this service

tests/
├── test_encoder.py
├── test_foundation_loader.py
├── test_tabular.py
├── test_conformal.py
├── test_consumer.py
├── test_pusher.py
├── test_emitter.py
└── test_lockcheck.py
```

## Quickstart

```bash
# 1. Install
pip install -e ".[dev]"

# 2. Verify license lock
python -m qeeg_encoder.licensing.lockcheck

# 3. Pull foundation weights (out-of-image, signed)
mkdir -p /opt/models/labram-base
# ... follow models/README.md

# 4. Start dependencies
docker compose -f docker/docker-compose.dev.yml up -d

# 5. Run consumer
qeeg-encoder-consume

# 6. Tests
pytest
```

## Latency budget

- Foundation path: <1.5s p95 on a 10-min, 32-channel recording at 256Hz
- Tabular path: <100ms p95
- End-to-end (consume → embed → push → emit): <2s p95

## SLOs

- Conformal coverage on `responder_classifier`: 88-92% on rolling 7-day window
- DLQ rate: <0.5% of consumed events
- Feature-store push success: >99.9%

## What this is not

- Not a training service. Foundation weights are loaded read-only.
- Not autonomous. All outputs are advisory and gated by clinician feedback.
- Not a generative model. The report head lives in `packages/fusion/`, not here.

## See also

- `docs/BRAIN_TWIN_ARCHITECTURE.md` — the system around this service
- `docs/EVENT_BUS_SCHEMAS.md` — the event contracts
- `docs/FEATURE_STORE.md` — the feature-store contracts
- `docs/LEARNING_LOOP.md` — what happens to emitted ai_inference events downstream

