# DeepSynaps Feature Store (Layer 2) — scaffolding

This package is the minimal Layer 2 Feature Store scaffold described in
`deepsynaps_brain_twin_kit/docs/FEATURE_STORE.md`.

It provides:
- Feast feature definitions (`src/deepsynaps_features/definitions/`)
- Transform contracts (`src/deepsynaps_features/transforms/`)
- Streaming materializer wiring stubs (Faust) (`src/deepsynaps_features/streaming/`)
- A small retrieval API for online features (`src/deepsynaps_features/serve.py`)
- A Feast repo skeleton (`feature_repo/`)

This is intentionally minimal and focuses on correct contracts and naming.
## DeepSynaps Feature Store (Layer 2)

This package scaffolds the DeepSynaps Layer 2 Feature Store, sitting between the Kafka event bus and encoders/models.

Included:

- `src/deepsynaps_features/definitions/`: Feast entities + FeatureViews/StreamFeatureViews (stubs)
- `src/deepsynaps_features/transforms/`: batch + online feature computation contracts
- `src/deepsynaps_features/streaming/workers.py`: Faust wiring + Redis write stubs
- `src/deepsynaps_features/serve.py`: Redis-backed feature retrieval function
- `feature_repo/`: Feast repository skeleton
- `tests/`: test outlines (no infra required)

