# deepsynaps-qeeg-trainer

Offline training rig for DeepSynaps qEEG condition-likelihood models.

This app is **training-side only**. Production inference remains clean and does **not**
depend on NeuralSet / NeuralFetch.

## Quickstart

```bash
python -m venv .venv
source .venv/bin/activate  # (Windows: .venv\Scripts\activate)
pip install -e .

# Example: train ADHD likelihood model (requires dataset on disk)
qeeg-train --task adhd --out-dir ./out
```

## Layout

- `src/qeeg_trainer/studies/`: dataset adapters (TDBRAIN, TUEG, NMT)
- `src/qeeg_trainer/tasks/`: per-task configs (YAML)
- `src/qeeg_trainer/train.py`: training entrypoint (NeuralSet → braindecode/skorch)
- `src/qeeg_trainer/export.py`: export weights + metadata for runtime registry

