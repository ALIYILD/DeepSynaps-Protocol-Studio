# DeepTwin NeuroAI Lab

**Research-only.** This package provides Pydantic schemas, a multimodal event timeline, deterministic feature-extraction placeholders, and simulation contracts for DeepTwin. It does **not** provide diagnoses, treatment recommendations, or autonomous neuromodulation protocol selection.

It is inspired by **conceptual** patterns from public NeuroAI tooling (e.g. NeuralSet-style events and extractors) but **does not** depend on Meta’s `neuralset` / `neuroai` packages.

## Install

From the monorepo root:

```bash
pip install -e packages/deeptwin-neuroai-lab
```

## Tests

```bash
cd packages/deeptwin-neuroai-lab && pytest
```
