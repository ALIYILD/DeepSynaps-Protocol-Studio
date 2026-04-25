## Foundation-model embeddings (LaBraM, EEGPT)

### What this adds

The qEEG pipeline can optionally compute **windowed foundation-model embeddings**:

- **LaBraM** (`labram-base`)
- **EEGPT** (`eegpt-base`)

When enabled, `run_full_pipeline(..., compute_embeddings=True)` populates:

- `PipelineResult.embeddings["labram-base"]`: `np.ndarray` shaped `(n_windows, d)`
- `PipelineResult.embeddings["eegpt-base"]`: `np.ndarray` shaped `(n_windows, d)`

and persists them to disk as `embeddings.npz` under `out_dir`.

### Hard constraints: weights are not baked into containers

Model weights **must not** live in the runtime container image.

Instead:

- Weights are fetched **on first use** from Hugging Face.
- Weights are cached under a **host-mounted** directory (default `~/.cache/deepsynaps/`).
- Containers must mount this cache directory (read/write) to make the first run succeed.

If the cache is not mounted and the container has no network access, embedding computation will fail and the pipeline will record the error under `quality.stage_errors["embeddings"]`.

### License allowlist policy (enforced at load time)

We refuse to load weights unless:

- The model’s **license metadata exists** on Hugging Face.
- The license is in our **allowlist** (commercially usable, permissive).
- The model repo is pinned to an **exact commit SHA**.

We explicitly refuse:

- Non-commercial licenses (e.g. `cc-by-nc-*`)
- Unknown or missing licenses
- Any repo state that does not match our pinned SHA

Rationale: embeddings are computed in commercial deployments; we must ensure weight licenses are compatible and auditable.

### Pinned model commits (allowlisted)

These pins are enforced in `deepsynaps_qeeg.embeddings.registry.MODEL_SPECS`:

- **LaBraM (Braindecode hosted)**:
  - **repo**: `braindecode/labram-pretrained`
  - **license**: `bsd-3-clause`
  - **pinned sha**: `0563b6c626e7b40d9a36653b763715db94d945d7`

- **EEGPT (Braindecode hosted)**:
  - **repo**: `braindecode/eegpt-pretrained`
  - **license**: `bsd-3-clause`
  - **pinned sha**: `e41cb3ae2ce4fd9eb736862292c91f8128d15618`

### Deployment note: cache path

Default cache root is:

- Windows: `%USERPROFILE%\.cache\deepsynaps\`
- Linux/macOS: `~/.cache/deepsynaps/`

Override is supported via the embedder factory:

```python
from deepsynaps_qeeg.embeddings import get_embedder

embedder = get_embedder("labram-base", cache_dir="/mnt/deepsynaps-cache")
```

