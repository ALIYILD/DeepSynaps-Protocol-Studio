# Foundation-model weights

**Weights are never bundled in the runtime image.** They are mounted at runtime
from `/opt/models/<backbone>/` after SHA256 verification against
`configs/models.lock.yaml`.

## Layout

```
/opt/models/
├── labram-base/
│   └── pytorch_model.bin       # SHA256 must match models.lock.yaml
└── eegpt-small/
    └── model.safetensors
```

## Pull procedure (production)

1. Identify the pinned model id and SHA256 in `configs/models.lock.yaml`.
2. Pull the artifact from the internal model registry (e.g. MLflow, S3 with Object Lock).
3. Verify SHA256 BEFORE mounting. The encoder will refuse to start otherwise.
4. Mount read-only at `/opt/models/<backbone>/`.

## Pull procedure (local dev)

If `/opt/models/<backbone>/` is empty or missing, the encoder runs in **stub
mode** with a deterministic small backbone. The contract is identical so
unit tests, integration tests, and even local end-to-end smoke tests work
without weights. Stub mode is logged with `backbone_stub_mode` so it is
obvious in production logs that real weights are missing.

## License gate

Every entry in `models.lock.yaml` is checked against the permissive license
allow-list (Apache-2.0, MIT, BSD). Any non-permissive license, any token
matching `NC` / `NonCommercial` / `GPL-3` / `AGPL`, or any banned model id
fails the build.

Banned models (explicit):
- **tribe-v2** — CC BY-NC 4.0, fMRI not EEG, forward encoder not classifier.

