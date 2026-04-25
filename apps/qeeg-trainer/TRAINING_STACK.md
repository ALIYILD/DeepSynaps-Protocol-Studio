Training Stack — qEEG condition-likelihood models
Status: decision record. Source-of-truth for how DeepSynaps trains the
deep-learning models that feed qEEG condition likelihood inference.
Last updated 2026-04-25.

This document covers the offline training rig only. The runtime inference path
stays lean for IEC 62304 / SOUP cleanliness — production inference loads
exported `*.pt` weights with a thin `deepsynaps_qeeg.models` loader (no NeuralSet
in production).

## Decision summary

- **EEG → PyTorch**: NeuralSet (Meta FAIR, MIT, MNE-backed)
- **Benchmark dataset downloads**: NeuralFetch
- **Architectures**: braindecode (Deep4Net, EEGNetv4, EEGConformer, ATCNet)
- **Training runtime**: DeepSynaps GPU box → MLflow tracking → S3 weights bucket
- **Production runtime ships**: exported `*.pt` weights + a thin loader
- **NeuralSet in production container**: no (training-side only)

## Repo layout

Training app:

```
apps/qeeg-trainer/
  pyproject.toml
  src/qeeg_trainer/
    studies/
    tasks/
    train.py
    export.py
```

Production loader scaffold:

```
packages/qeeg-pipeline/src/deepsynaps_qeeg/models/
  loader.py
  inference.py
  registry.yaml
```

## Versions (training-side)

- neuralset pinned to `0.1.0` until it reaches `1.0`
- see `apps/qeeg-trainer/pyproject.toml` for the dependency set

